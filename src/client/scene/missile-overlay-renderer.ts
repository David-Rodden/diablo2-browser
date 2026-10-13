import {
  getMissileTxtData,
  type Projectile,
} from '../../common/skills/missiles-data.ts'
import type { AtlasFrame } from '../render/atlas.ts'
import {
  MISSILE_METAS,
  velocityToDccDirection,
  type MissileFrameTuple,
  type MissileMeta,
} from '../render/missiles-meta.ts'
import {
  OVERLAY_METAS,
  type OverlayMeta,
} from '../render/overlays-meta.ts'
import type {
  AtlasHandle,
  SpriteRenderer,
} from '../render/renderer.ts'
import { reportMissingArt } from './world-renderer.ts'

export {
  MISSILE_METAS,
  OVERLAY_METAS,
  getMissileTxtData,
  velocityToDccDirection,
  type MissileFrameTuple,
  type MissileMeta,
  type OverlayMeta,
}

/**
 * Packed missile animation asset loaded into GPU memory.
 */
export interface LoadedMissileArt {
  readonly meta: MissileMeta
  readonly handle: AtlasHandle
  readonly frames: AtlasFrame[][]
}

/**
 * Packed overlay animation asset loaded into GPU memory.
 */
export interface LoadedOverlayArt {
  readonly meta: OverlayMeta
  readonly handle: AtlasHandle
  readonly frames: AtlasFrame[][]
}

interface PackedSpriteMetaBase {
  readonly name: string
  readonly celFile?: string | undefined
  readonly width: number
  readonly height: number
  readonly groups: readonly (readonly MissileFrameTuple[])[]
}

async function loadPackedSpriteArtMap<M extends PackedSpriteMetaBase>(options: {
  readonly label: string
  readonly subdir: 'missiles' | 'overlays'
  readonly metas: Readonly<Record<string, M>>
  readonly renderer: SpriteRenderer
  readonly packBase?: string | undefined
  readonly filterTarget?: ((meta: M) => boolean) | undefined
  readonly extraStems?: ((name: string, metaHint: M | undefined) => readonly string[]) | undefined
  readonly overrideNameOnStemMismatch?: boolean | undefined
  readonly fallbackAliasKey?: ((meta: M, map: ReadonlyMap<string, { readonly meta: M; readonly handle: AtlasHandle; readonly frames: AtlasFrame[][] }>) => { readonly meta: M; readonly handle: AtlasHandle; readonly frames: AtlasFrame[][] } | undefined) | undefined
}): Promise<Map<string, { readonly meta: M; readonly handle: AtlasHandle; readonly frames: AtlasFrame[][] }>> {
  type ArtEntry = { readonly meta: M; readonly handle: AtlasHandle; readonly frames: AtlasFrame[][] }
  const map = new Map<string, ArtEntry>()
  if (typeof fetch === 'undefined' || typeof createImageBitmap === 'undefined') return map
  const allMetas = Object.values(options.metas)
  const filteredMetas = options.filterTarget ? allMetas.filter(options.filterTarget) : allMetas
  const targets = Array.from(new Set(filteredMetas.map(m => m.name.toLowerCase())))
  const cleanBase = options.packBase ? options.packBase.replace(/\/+$/, '') : ''
  const baseCandidates = [
    `/${options.subdir}`,
    cleanBase ? `${cleanBase}/${options.subdir}` : '',
  ].filter(Boolean)

  const failures: string[] = []

  await Promise.all(
    targets.map(async name => {
      let loaded = false
      let lastReason = ''
      const metaHint = options.metas[name]
      const extra = options.extraStems ? options.extraStems(name, metaHint) : []
      const candidateStems = Array.from(
        new Set(
          [name.toLowerCase(), metaHint?.celFile?.toLowerCase() ?? '', ...extra].filter(
            (s): s is string => Boolean(s) && s !== 'null',
          ),
        ),
      )
      for (const base of baseCandidates) {
        for (const stem of candidateStems) {
          try {
            const [jsonResp, pngResp] = await Promise.all([
              fetch(`${base}/${stem}.json`),
              fetch(`${base}/${stem}.png`),
            ])
            if (jsonResp.ok && pngResp.ok) {
              const rawMeta = (await jsonResp.json()) as M
              const meta: M =
                options.overrideNameOnStemMismatch && metaHint && stem !== name
                  ? { ...rawMeta, name }
                  : rawMeta
              const blob = await pngResp.blob()
              const bitmap = await createImageBitmap(blob)
              let handle: AtlasHandle
              try {
                handle = options.renderer.addAtlas(bitmap, meta.width, meta.height)
              } finally {
                bitmap.close()
              }
              const frames: AtlasFrame[][] = meta.groups.map((group: readonly MissileFrameTuple[]) =>
                group.map(([x, y, width, height, anchorX, anchorY]: MissileFrameTuple) => ({
                  x,
                  y,
                  width,
                  height,
                  ...(anchorX !== undefined ? { anchorX } : {}),
                  ...(anchorY !== undefined ? { anchorY } : {}),
                })),
              )
              const art: ArtEntry = { meta, handle, frames }
              map.set(name, art)
              map.set(name.toLowerCase(), art)
              map.set(stem, art)
              map.set(stem.toLowerCase(), art)
              if (meta.celFile) {
                map.set(meta.celFile, art)
                map.set(meta.celFile.toLowerCase(), art)
              }
              loaded = true
              break
            }
            lastReason = `${base}/${stem}.json (HTTP ${jsonResp.status}), ${base}/${stem}.png (HTTP ${pngResp.status})`
          } catch (err) {
            lastReason = `${base}/${stem}: ${err instanceof Error ? err.message : String(err)}`
          }
        }
        if (loaded) break
      }
      if (!loaded) {
        failures.push(`${name} [${lastReason || `tried: ${baseCandidates.join(', ')}`}]`)
      }
    }),
  )

  if (failures.length > 0) {
    console.error(
      `[${options.label}] ${failures.length} ${options.subdir.slice(0, -1)} atlas(es) unavailable (loaded ${map.size} keys): ${failures.slice(0, 8).join('; ')}`,
    )
  }

  for (const [alias, meta] of Object.entries(options.metas)) {
    const art =
      map.get(meta.name) ??
      map.get(meta.name.toLowerCase()) ??
      (meta.celFile ? (map.get(meta.celFile.toLowerCase()) ?? map.get(meta.celFile)) : undefined) ??
      options.fallbackAliasKey?.(meta, map)
    if (art) {
      if (!map.has(alias)) map.set(alias, art)
      if (!map.has(alias.toLowerCase())) map.set(alias.toLowerCase(), art)
    }
  }

  return map
}

/**
 * Load authentic 1.13c baked missile atlases from /missiles/*.png or packBase.
 */
export async function loadMissileArtMap(
  renderer: SpriteRenderer,
  packBase?: string,
): Promise<Map<string, LoadedMissileArt>> {
  return loadPackedSpriteArtMap<MissileMeta>({
    label: 'loadMissileArtMap',
    subdir: 'missiles',
    metas: MISSILE_METAS,
    renderer,
    packBase,
    overrideNameOnStemMismatch: true,
  })
}

/**
 * Load authentic 1.13c baked cast overlay atlases from /overlays/*.png or packBase.
 */
export async function loadOverlayArtMap(
  renderer: SpriteRenderer,
  packBase?: string,
): Promise<Map<string, LoadedOverlayArt>> {
  return loadPackedSpriteArtMap<OverlayMeta>({
    label: 'loadOverlayArtMap',
    subdir: 'overlays',
    metas: OVERLAY_METAS,
    renderer,
    packBase,
    filterTarget: m => m.celFile?.toLowerCase() !== 'null',
    extraStems: name => (name.toLowerCase() === 'cursecast' ? ['curse_hit'] : []),
    fallbackAliasKey: (meta, map) =>
      meta.name.toLowerCase() === 'cursecast' ? map.get('curse_hit') : undefined,
  })
}

/**
 * Render a Diablo II 1.13c missile projectile using authentic baked DCC sprite atlas.
 */
export function drawMissileProjectile(
  renderer: SpriteRenderer,
  shot: Projectile,
  missileArt?: LoadedMissileArt | null,
  missileArtMap?: Map<string, LoadedMissileArt> | null,
): void {
  if (shot.missileType === 'blizzardcenter') {
    return // Invisible controller missile
  }

  const resolvedArt =
    missileArt ??
    (shot.isTurret || shot.missileType === 'hydra_turret'
      ? (missileArtMap?.get(shot.missileType ?? 'hydra_turret') ?? missileArtMap?.get('hydra'))
      : shot.missileType !== undefined
        ? missileArtMap?.get(shot.missileType)
        : undefined)

  if (resolvedArt === undefined || resolvedArt === null) {
    return
  }

  const altitude = shot.altitude ?? 0
  const dccDir = velocityToDccDirection(shot.vx, shot.vy, resolvedArt.meta.directions)
  const frameCount = Math.max(1, resolvedArt.meta.framesPerDirection)

  let frameIndex: number
  if (resolvedArt.meta.name === 'meteorcenter') {
    const elapsed = shot.ageTicks ?? Math.max(0, 60 - shot.ttl)
    frameIndex = Math.floor((elapsed * resolvedArt.meta.animSpeed) / 16) % frameCount
  } else if (
    (resolvedArt.meta.name === 'meteorfire' ||
      resolvedArt.meta.name === 'firewall' ||
      resolvedArt.meta.name === 'groundfirebig') &&
    frameCount === 37
  ) {
    const defaultDuration =
      resolvedArt.meta.name === 'meteorfire'
        ? 90 + (Math.max(1, shot.slvl ?? 1) - 1) * 15
        : shot.ttl > 0
          ? (shot.ageTicks ?? 0) + shot.ttl
          : 90
    const duration = shot.fireDuration ?? defaultDuration
    const elapsed = shot.ageTicks ?? Math.max(0, duration - shot.ttl)
    const EXTINCTION_TICKS = 12
    if (shot.ttl <= EXTINCTION_TICKS) {
      frameIndex = Math.max(0, Math.min(11, shot.ttl - 1))
    } else {
      const animStep = Math.floor((elapsed * resolvedArt.meta.animSpeed) / 16)
      frameIndex = animStep < 12 ? animStep : 12 + ((animStep - 12) % 25)
    }
  } else {
    const elapsed = shot.ageTicks ?? Math.max(0, 100 - shot.ttl)
    frameIndex = Math.floor((elapsed * resolvedArt.meta.animSpeed) / 16) % frameCount
  }

  const group = resolvedArt.frames[dccDir] ?? resolvedArt.frames[0]
  const frame = group?.[frameIndex] ?? group?.[0]
  if (frame === undefined) {
    return
  }

  const isGroundFlame =
    resolvedArt.meta.name === 'meteorfire' ||
    resolvedArt.meta.name === 'firewall' ||
    resolvedArt.meta.name === 'groundfirebig'
  const isExtinguishing = isGroundFlame && shot.ttl <= 12
  const decayRatio = isExtinguishing ? Math.max(0, Math.min(1, shot.ttl / 12)) : 1.0
  const scale = isExtinguishing ? 0.2 + 0.8 * decayRatio : 1.0
  const opacity = isExtinguishing ? decayRatio : 1.0

  const drawW = frame.width * scale
  const drawH = frame.height * scale
  const baseAnchorX = frame.anchorX !== undefined ? frame.anchorX : -frame.width / 2
  const baseAnchorY = frame.anchorY !== undefined ? frame.anchorY : -frame.height / 2
  const drawX = shot.x + baseAnchorX * scale
  const drawY = (shot.y + (baseAnchorY + frame.height) * scale - drawH) - altitude

  let isAdditive = false
  try {
    isAdditive = getMissileTxtData(shot.missileType ?? resolvedArt.meta.name).trans === 1
  } catch {
    isAdditive = true
  }
  renderer.draw(frame, drawX, drawY, {
    atlas: resolvedArt.handle,
    ...(isAdditive ? { blendMode: 'additive' } : {}),
    ...(isExtinguishing
      ? {
          width: drawW,
          height: drawH,
          tint: [1, 1, 1, opacity],
        }
      : {}),
  })

  if (shot.missileType === 'meteorcenter' && missileArtMap != null && shot.ttl > 0) {
    const remainingTicks = shot.ttl
    const fallAltitude = remainingTicks * 25
    const slideX = -remainingTicks * 15
    const meteorX = shot.x + slideX
    const meteorY = shot.y
    const elapsed = shot.ageTicks ?? Math.max(0, 60 - shot.ttl)

    const tailArt = missileArtMap.get('meteortail')
    if (tailArt !== undefined) {
      const tailGroup = tailArt.frames[0]
      const tailFrameCount = Math.max(1, tailArt.meta.framesPerDirection)
      const tailFrameIndex = Math.floor((elapsed * tailArt.meta.animSpeed) / 16) % tailFrameCount
      const tailFrame = tailGroup?.[tailFrameIndex] ?? tailGroup?.[0]
      if (tailFrame !== undefined) {
        const tailDrawX = tailFrame.anchorX !== undefined ? meteorX + tailFrame.anchorX : meteorX - tailFrame.width / 2
        const tailDrawY = (tailFrame.anchorY !== undefined ? meteorY + tailFrame.anchorY : meteorY - tailFrame.height / 2) - fallAltitude
        renderer.draw(tailFrame, tailDrawX, tailDrawY, {
          atlas: tailArt.handle,
          blendMode: 'additive',
        })
      }
    }

    const meteorArt = missileArtMap.get('meteor')
    if (meteorArt !== undefined) {
      const meteorGroup = meteorArt.frames[0]
      const meteorFrameCount = Math.max(1, meteorArt.meta.framesPerDirection)
      const meteorFrameIndex = Math.floor((elapsed * meteorArt.meta.animSpeed) / 16) % meteorFrameCount
      const meteorFrame = meteorGroup?.[meteorFrameIndex] ?? meteorGroup?.[0]
      if (meteorFrame !== undefined) {
        const meteorDrawX = meteorFrame.anchorX !== undefined ? meteorX + meteorFrame.anchorX : meteorX - meteorFrame.width / 2
        const meteorDrawY = (meteorFrame.anchorY !== undefined ? meteorY + meteorFrame.anchorY : meteorY - meteorFrame.height / 2) - fallAltitude
        renderer.draw(meteorFrame, meteorDrawX, meteorDrawY, {
          atlas: meteorArt.handle,
          blendMode: 'additive',
        })
      }
    }
  }
}

/**
 * Render an active Diablo II 1.13c Town Portal (`Objects.txt` ID 59, Token `TP`):
 * - Plays 15-frame opening sequence (`OP`: `tptrlitophth` + `tphdlitophth`) at 200/256 * 25 fps (51.2 ms/frame, 768 ms total),
 *   then loops 15-frame operating sequence (`ON`: `tptrlitonhth` + `tphdlitonhth`).
 * - Draws `TR` ground shadow layer with normal blending and `HD` blue vortex layer with additive blending.
 */
export function drawTownPortal(
  renderer: SpriteRenderer,
  x: number,
  y: number,
  elapsedMs: number,
  overlayArtMap: ReadonlyMap<string, LoadedOverlayArt>,
): void {
  const frameDurationMs = 51.2 // 1000 / (25 * 200 / 256)
  const openDurationMs = 15 * frameDurationMs // 768 ms
  const isOpening = elapsedMs < openDurationMs
  const trArt = overlayArtMap.get(isOpening ? 'town_portal_op_tr' : 'town_portal_on_tr')
  const hdArt = overlayArtMap.get(isOpening ? 'town_portal_op_hd' : 'town_portal_on_hd')
  const rawFrameIdx = isOpening
    ? Math.min(14, Math.max(0, Math.floor(elapsedMs / frameDurationMs)))
    : Math.max(0, Math.floor((elapsedMs - openDurationMs) / frameDurationMs)) % 15

  let drewSprite = false
  if (trArt !== undefined) {
    const group = trArt.frames[0]
    const frame = group?.[rawFrameIdx] ?? group?.[0]
    if (frame !== undefined) {
      const drawX = frame.anchorX !== undefined ? x + frame.anchorX : x - frame.width / 2
      const drawY = frame.anchorY !== undefined ? y + frame.anchorY : y - frame.height / 2
      renderer.draw(frame, drawX, drawY, {
        atlas: trArt.handle,
        blendMode: 'normal',
      })
      drewSprite = true
    }
  }
  if (hdArt !== undefined) {
    const group = hdArt.frames[0]
    const frame = group?.[rawFrameIdx] ?? group?.[0]
    if (frame !== undefined) {
      const drawX = frame.anchorX !== undefined ? x + frame.anchorX : x - frame.width / 2
      const drawY = frame.anchorY !== undefined ? y + frame.anchorY : y - frame.height / 2
      renderer.draw(frame, drawX, drawY, {
        atlas: hdArt.handle,
        blendMode: 'additive',
        elevationY: Math.max(0, frame.height - 16),
      })
      renderer.setBlendMode('normal')
      drewSprite = true
    }
  }
  if (!drewSprite) {
    reportMissingArt(
      'overlay',
      isOpening ? 'town_portal_op' : 'town_portal_on',
      'Missing town portal sprite atlas in overlayArtMap',
    )
  }
}
