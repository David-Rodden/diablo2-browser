/**
 * Offline Asset Manifest Generator (`src/baker/io/asset-manifest.ts`).
 *
 * Scans `public/` and `samples/d2-packs/` (mounted at `/diablo2/packs/` in production),
 * computes a 16-hex-char SHA-256 content hash per asset file, and emits
 * `public/asset-manifest.json` for Service Worker per-file incremental cache invalidation.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  isCacheableAssetPath,
  validateAssetManifest,
  type AssetManifest,
  type AssetManifestAssetValue,
} from '../../common/pack-contract/index.ts'

export interface GenerateAssetManifestOptions {
  readonly rootDir?: string | undefined
  readonly publicDir?: string | undefined
  readonly packsDir?: string | undefined
  readonly includePacksDir?: boolean | undefined
  readonly outputFile?: string | null | undefined
  readonly generatedAt?: string | undefined
}

function walkDirectoryFiles(baseDir: string, currentDir: string = baseDir, out: string[] = []): string[] {
  if (!existsSync(currentDir)) return out
  const entries = readdirSync(currentDir).sort()
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const fullPath = join(currentDir, name)
    let st
    try {
      st = statSync(fullPath)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      walkDirectoryFiles(baseDir, fullPath, out)
    } else if (st.isFile()) {
      out.push(fullPath)
    }
  }
  return out
}

export function hashFileSha256Prefix(filePath: string): {
  readonly hash: string
  readonly sha256: string
  readonly bytes: number
} {
  const buf = readFileSync(filePath)
  const sha256 = createHash('sha256').update(buf).digest('hex')
  const hash = sha256.slice(0, 16)
  return { hash, sha256, bytes: buf.byteLength }
}

function isSfxPackBinKey(key: string): boolean {
  return key.startsWith('sound/packs/') && key.endsWith('.bin')
}

/**
 * Generates a deterministic `AssetManifest` across `public/`.
 */
export function generateAssetManifest(options?: GenerateAssetManifestOptions): AssetManifest {
  const rootDir = resolve(options?.rootDir ?? process.cwd())
  const publicDir = resolve(options?.publicDir ?? join(rootDir, 'public'))
  const packsDir = resolve(options?.packsDir ?? join(publicDir, 'packs'))
  const includePacksDir = options?.includePacksDir ?? Boolean(options?.packsDir)
  const outputFile =
    options?.outputFile === undefined
      ? join(publicDir, 'asset-manifest.json')
      : options.outputFile

  const entriesMap = new Map<string, { readonly hash: string; readonly sha256: string; readonly bytes: number }>()
  let totalBytes = 0

  if (existsSync(publicDir)) {
    for (const fullPath of walkDirectoryFiles(publicDir)) {
      const rel = relative(publicDir, fullPath).replace(/\\/g, '/')
      if (!isCacheableAssetPath(rel)) continue
      const info = hashFileSha256Prefix(fullPath)
      entriesMap.set(rel, info)
      totalBytes += info.bytes
    }
  }

  if (includePacksDir && existsSync(packsDir)) {
    for (const fullPath of walkDirectoryFiles(packsDir)) {
      const rel = relative(packsDir, fullPath).replace(/\\/g, '/')
      const canonicalKey = `packs/${rel}`
      if (!isCacheableAssetPath(canonicalKey)) continue
      if (entriesMap.has(canonicalKey)) continue
      const info = hashFileSha256Prefix(fullPath)
      entriesMap.set(canonicalKey, info)
      totalBytes += info.bytes
    }
  }

  const sortedKeys = [...entriesMap.keys()].sort()
  const files: Record<string, string> = {}
  const assets: Record<string, AssetManifestAssetValue> = {}
  const versionHasher = createHash('sha256')
  for (const key of sortedKeys) {
    const info = entriesMap.get(key)!
    files[key] = info.hash
    assets[key] = isSfxPackBinKey(key) ? { sha256: info.sha256, bytes: info.bytes } : info.hash
    versionHasher.update(`${key}:${info.hash}\n`)
  }
  const version =
    sortedKeys.length > 0 ? versionHasher.digest('hex').slice(0, 16) : '0000000000000000'

  const manifest: AssetManifest = validateAssetManifest({
    schema: 1,
    version,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    totalFiles: sortedKeys.length,
    totalBytes,
    files,
    assets,
  })

  if (outputFile) {
    mkdirSync(dirname(outputFile), { recursive: true })
    // Compact JSON: ~25k per-file hash entries; pretty-printing doubled the
    // no-store boot fetch of asset-manifest.json.
    const jsonStr = `${JSON.stringify(manifest)}\n`
    writeFileSync(outputFile, jsonStr, 'utf8')
  }

  return manifest
}

/**
 * Incrementally refreshes specific `public/` subdirectories (default `['ui']`) inside an existing
 * `AssetManifest` (or from an empty manifest if none exists), recomputing per-file SHA-256 prefixes
 * and the top-level `version` hash in ~15ms so dev servers never serve stale UI asset hashes.
 */
export function refreshAssetManifestPublicSubdirs(options?: {
  readonly baseManifest?: AssetManifest | null | undefined
  readonly publicDir?: string | undefined
  readonly subdirs?: readonly string[] | undefined
  readonly generatedAt?: string | undefined
}): AssetManifest {
  const publicDir = resolve(options?.publicDir ?? join(process.cwd(), 'public'))
  const subdirs = options?.subdirs ?? ['ui']
  const entriesMap = new Map<string, string>()
  const assetsMap = new Map<string, AssetManifestAssetValue>()

  if (options?.baseManifest) {
    for (const [key, hash] of Object.entries(options.baseManifest.files)) {
      const inRefreshedSubdir = subdirs.some((sub) => key === sub || key.startsWith(`${sub}/`))
      if (!inRefreshedSubdir) {
        entriesMap.set(key, hash)
        assetsMap.set(key, options.baseManifest.assets?.[key] ?? hash)
      }
    }
  }

  let refreshedSubdirBytes = 0
  for (const sub of subdirs) {
    const subDirPath = join(publicDir, sub)
    if (!existsSync(subDirPath)) continue
    for (const fullPath of walkDirectoryFiles(subDirPath)) {
      const rel = relative(publicDir, fullPath).replace(/\\/g, '/')
      if (!isCacheableAssetPath(rel)) continue
      const { hash, sha256, bytes } = hashFileSha256Prefix(fullPath)
      entriesMap.set(rel, hash)
      assetsMap.set(rel, isSfxPackBinKey(rel) ? { sha256, bytes } : hash)
      refreshedSubdirBytes += bytes
    }
  }

  const sortedKeys = [...entriesMap.keys()].sort()
  const files: Record<string, string> = {}
  const assets: Record<string, AssetManifestAssetValue> = {}
  const versionHasher = createHash('sha256')
  for (const key of sortedKeys) {
    const hash = entriesMap.get(key)!
    files[key] = hash
    assets[key] = assetsMap.get(key) ?? hash
    versionHasher.update(`${key}:${hash}\n`)
  }
  const version =
    sortedKeys.length > 0 ? versionHasher.digest('hex').slice(0, 16) : '0000000000000000'

  return validateAssetManifest({
    schema: 1,
    version,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    totalFiles: sortedKeys.length,
    totalBytes: Math.max(options?.baseManifest?.totalBytes ?? 0, refreshedSubdirBytes),
    files,
    assets,
  })
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  const skipPacks = process.argv.includes('--public-only')
  const manifest = generateAssetManifest({ includePacksDir: !skipPacks })
  console.log(
    `✓ Generated asset-manifest.json (version=${manifest.version}, files=${manifest.totalFiles}, totalMB=${(manifest.totalBytes / (1024 * 1024)).toFixed(2)} MB)`,
  )
}
