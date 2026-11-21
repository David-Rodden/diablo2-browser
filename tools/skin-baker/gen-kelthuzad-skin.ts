/**
 * Kel'Thuzad (Archlich) + Scourge summon set packer (`tools/skin-baker/gen-kelthuzad-skin.ts`).
 *
 * Builds the built-in `ne-kelthuzad` real-time mesh skin: converts the Warcraft III models to
 * `.glb` (`convert_war3_mdx_to_glb.py`), content-hashes every file, and writes a schema 2
 * (`format: 'mesh'`) manifest into `public/skins/`.
 *
 * The Warcraft III source assets are not part of this repository. They are read from
 * `WAR3_MPQ_DIR`, or `<home>/d2-data/war3-mpq` when that variable is unset; without them the
 * script fails rather than emitting a placeholder.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildStoreZipArchive } from '../../src/common/formats/zip-reader.ts'
import { validateCharacterSkinManifest } from '../../src/common/units/character-skin.ts'
import { parseMeshSkinModel } from '../../src/common/units/mesh-skin-model.ts'
import { writeSkinBundleToPublicSkinsDir, type PackedCharacterSkinBundle } from './pack-skin.ts'

interface ConvertedClip {
  readonly durationMs: number
  readonly loop: boolean
  readonly source: string
  readonly moveSpeed: number
  readonly actionAt?: number
}

interface ConvertedUnit {
  readonly glb: string
  readonly portrait: string
  readonly pxPerUnit: number
  readonly box: { readonly width: number; readonly height: number; readonly footX: number; readonly footY: number }
  readonly clips: Readonly<Record<string, ConvertedClip>>
}

interface ConvertedUnits {
  readonly preview: string
  readonly units: Readonly<Record<string, ConvertedUnit>>
}

const MINIONS: Readonly<
  Record<string, { readonly name: { readonly zh: string; readonly en: string }; readonly shadowScale: number }>
> = {
  necroskeleton: { name: { zh: '食尸鬼', en: 'Ghoul' }, shadowScale: 0.78 },
  necromage: { name: { zh: '亡灵巫师', en: 'Necromancer' }, shadowScale: 0.85 },
  claygolem: { name: { zh: '岩石傀儡', en: 'Rock Golem' }, shadowScale: 0.96 },
  bloodgolem: { name: { zh: '憎恶', en: 'Abomination' }, shadowScale: 0.96 },
  irongolem: { name: { zh: '血肉傀儡', en: 'Flesh Golem' }, shadowScale: 0.96 },
  firegolem: { name: { zh: '地狱火', en: 'Infernal' }, shadowScale: 0.98 },
}

/** Diablo II modes that reuse another converted clip of the same unit. */
const HERO_CLIP_ALIASES: Readonly<Record<string, string>> = { rn: 'wl' }

function resolveWar3MpqDir(): string {
  const dir = process.env.WAR3_MPQ_DIR ?? join(homedir(), 'd2-data', 'war3-mpq')
  if (!existsSync(join(dir, 'units', 'undead', 'herolich', 'herolich.mdx'))) {
    throw new Error(
      'Warcraft III source assets not found. Set WAR3_MPQ_DIR to an extracted War3.mpq tree ' +
        '(expected units/undead/herolich/herolich.mdx inside it).',
    )
  }
  return dir
}

function hashedName(stem: string, ext: string, bytes: Uint8Array): string {
  const hash8 = createHash('sha256').update(bytes).digest('hex').slice(0, 8)
  return `${stem}-${hash8}.${ext}`
}

function meshSpec(unit: ConvertedUnit, file: string, aliases: Readonly<Record<string, string>> = {}) {
  const clips: Record<string, unknown> = {}
  const add = (key: string, source: string): void => {
    const c = unit.clips[source]
    if (!c) throw new Error(`Converted unit is missing clip "${source}"`)
    clips[key] = {
      anim: source,
      loop: c.loop,
      durationMs: c.durationMs,
      ...(c.moveSpeed > 0 ? { moveSpeed: c.moveSpeed } : {}),
      ...(c.actionAt !== undefined ? { actionAt: c.actionAt } : {}),
    }
  }
  for (const key of Object.keys(unit.clips)) add(key, key)
  for (const [key, source] of Object.entries(aliases)) add(key, source)
  return { file, pxPerUnit: unit.pxPerUnit, box: unit.box, clips }
}

export function generateKelthuzadSkinBundle(): PackedCharacterSkinBundle {
  const war3Dir = resolveWar3MpqDir()
  const converter = join(dirname(fileURLToPath(import.meta.url)), 'convert_war3_mdx_to_glb.py')
  const tmpDir = mkdtempSync(join(tmpdir(), 'd2w-war3-glb-'))
  try {
    execFileSync('python3', [converter, '--war3-dir', war3Dir, '--out-dir', tmpDir, '--verify'], {
      stdio: 'inherit',
    })
    const converted = JSON.parse(readFileSync(join(tmpDir, 'units.json'), 'utf8')) as ConvertedUnits
    const files: Record<string, Uint8Array> = {}
    const read = (name: string): Uint8Array => new Uint8Array(readFileSync(join(tmpDir, name)))

    const addModel = (unitKey: string, stem: string): { readonly unit: ConvertedUnit; readonly file: string } => {
      const unit = converted.units[unitKey]
      if (!unit) throw new Error(`Converter output is missing unit "${unitKey}"`)
      const bytes = read(unit.glb)
      // Fail here, not in the browser, if the model cannot be loaded by the runtime parser.
      const model = parseMeshSkinModel(bytes)
      for (const clipKey of Object.keys(unit.clips)) {
        if (!model.clips[clipKey]) throw new Error(`${unit.glb} is missing animation "${clipKey}"`)
      }
      const file = hashedName(stem, 'glb', bytes)
      files[file] = bytes
      return { unit, file }
    }

    const hero = addModel('hero', 'hero')
    const previewBytes = read(converted.preview)
    const previewFile = hashedName('preview', 'png', previewBytes)
    files[previewFile] = previewBytes

    const minions: Record<string, unknown> = {}
    for (const [key, meta] of Object.entries(MINIONS)) {
      const m = addModel(key, `minion-${key}`)
      const portraitBytes = read(m.unit.portrait)
      const portraitFile = hashedName(`portrait-${key}`, 'png', portraitBytes)
      files[portraitFile] = portraitBytes
      minions[key] = {
        name: meta.name,
        directions: 64,
        shadowScale: meta.shadowScale,
        portraitFile,
        mesh: meshSpec(m.unit, m.file),
      }
    }

    const manifest = validateCharacterSkinManifest({
      schema: 2,
      id: 'ne-kelthuzad',
      name: { zh: '巫妖克尔苏加德', en: "Kel'Thuzad (Archlich)" },
      description: {
        zh: '《魔兽争霸3》天灾军团实时 3D 骨骼模型：巫妖浮空飘行、护命匣阵亡形态，并同步把死灵召唤物替换为食尸鬼、亡灵巫师、岩石傀儡、憎恶、血肉傀儡与地狱火，附专属头像。',
        en: "Real-time Warcraft III Scourge models: hovering Archlich Kel'Thuzad with a Frost Phylactery death form, plus Ghoul, Necromancer, Rock Golem, Abomination, Flesh Golem and Infernal summons with their own portraits.",
      },
      targetClass: 'ne',
      format: 'mesh',
      directions: 64,
      floating: true,
      shadowOffsetY: 10,
      shadowScale: 0.72,
      respectMorph: false,
      previewFile,
      mesh: meshSpec(hero.unit, hero.file, HERO_CLIP_ALIASES),
      minions,
    })
    files['skin.json'] = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)

    const zipBytes = buildStoreZipArchive(
      Object.keys(files)
        .sort()
        .map((path) => ({ path, bytes: files[path]! })),
    )
    return { manifest, files, zipBytes }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outRoot = process.argv[2] ? resolve(process.argv[2]) : resolve(process.cwd(), 'public', 'skins')
  const bundle = generateKelthuzadSkinBundle()
  writeSkinBundleToPublicSkinsDir(bundle, outRoot, true)
  const totalBytes = Object.values(bundle.files).reduce((sum, b) => sum + b.byteLength, 0)
  console.log(
    `Packed ${bundle.manifest.id} -> ${outRoot}/${bundle.manifest.id} (${String(Object.keys(bundle.files).length)} files, ${(totalBytes / 1024).toFixed(1)} KB)`,
  )
}
