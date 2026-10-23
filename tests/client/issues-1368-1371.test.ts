/**
 * Parity and Regression Tests for Issues #1368 - #1371:
 * - Issue #1368: Automap reciprocal area transition labels overlap deduplication
 * - Issue #1369: Poison cloud missile blendMode trans75, tick timing & double tinting elimination
 * - Issue #1370: Widescreen camera boundary convergence & border skirt margin fill
 * - Issue #1371: Corner minimap HUD clearance & dummy shrine exclusion
 */
import { describe, expect, it } from 'vitest'
import { AutomapView } from '../../src/client/automap/automap-view.ts'
import type { LevelDrawItem, LevelView } from '../../src/client/map/level-view.ts'
import type { MapService } from '../../src/client/map/map-service.ts'
import { MISSILE_METAS } from '../../src/client/render/missiles-meta.ts'
import { computeAutomapViewport } from '../../src/client/ui/minimap.ts'
import {
  ClientWorldSceneSource,
  computeConvergedCameraTopLeft,
} from '../../src/client/view/scene-source.ts'
import {
  buildSceneDrawables,
  type RenderableUnitInput,
} from '../../src/client/view/unit-drawables.ts'
import { getViewportProfile } from '../../src/client/view/viewport-profile.ts'
import { rollPoisonCloudPuffTargets113c } from '../../src/client/world/world-missile-stepper.ts'
import {
  CANONICAL_113C_OBJECTS,
  resolveObjectName,
  resolveShrineOverlays113c,
} from '../../src/common/world/objects-meta.ts'

function makeMockLevelView(options: {
  areaId: number
  tileOriginX: number
  tileOriginY: number
  cellsX?: number
  cellsY?: number
  floors?: readonly LevelDrawItem[]
  entrances?: LevelView['entrances']
}): LevelView {
  const cellsX = options.cellsX ?? 16
  const cellsY = options.cellsY ?? 16
  const subW = cellsX * 5
  const subH = cellsY * 5
  const subOriginX = options.tileOriginX * 5
  const subOriginY = options.tileOriginY * 5

  return {
    id: options.areaId,
    areaId: options.areaId,
    levelId: options.areaId,
    act: 0,
    seed: 0x12345678,
    difficulty: 0,
    originX: subOriginX,
    originY: subOriginY,
    subOriginX,
    subOriginY,
    width: subW,
    height: subH,
    subWidth: subW,
    subHeight: subH,
    tileOriginX: options.tileOriginX,
    tileOriginY: options.tileOriginY,
    tileWidth: cellsX - 1,
    tileHeight: cellsY - 1,
    cellsX,
    cellsY,
    gridWidth: subW,
    gridHeight: subH,
    isoOriginX: subH * 16,
    isoOriginY: 0,
    collision: new Uint16Array(subW * subH),
    collisionMasks: new Uint16Array(subW * subH),
    blocked: new Uint8Array(subW * subH),
    walkable: new Uint8Array(subW * subH).fill(1),
    floors: options.floors ?? [],
    shadows: [],
    walls: [],
    roofs: [],
    entrances: options.entrances ?? [],
    warps: [],
    landmarks: [],
    rooms: [
      {
        index: 0,
        areaId: options.areaId,
        tileX: options.tileOriginX,
        tileY: options.tileOriginY,
        tileW: cellsX,
        tileH: cellsY,
        localTileX: 0,
        localTileY: 0,
        subX: 0,
        subY: 0,
        subW,
        subH,
        worldSubX: subOriginX,
        worldSubY: subOriginY,
        revealed: true,
      },
    ],
    spawnX: subOriginX + 5,
    spawnY: subOriginY + 5,
    automap: {
      layerId: 1,
      levelTypeId: 1,
      floors: [],
      walls: [],
      objects: [],
      extras: [],
    },
  } as unknown as LevelView
}

describe('Issue #1368: Automap Reciprocal Exit Labels Deduplication', () => {
  it('deduplicates reciprocal exit markers between stitched areas so borders show only outward labels', () => {
    // Area 40 (Lut Gholein) at tileOrigin (0, 0), exit to Area 41 at (15, 5)
    // Area 41 (Rocky Waste) adjacent at tileOrigin (15, 0), exit back to Area 40 at (0, 5)
    const lutGholein = makeMockLevelView({
      areaId: 40,
      tileOriginX: 0,
      tileOriginY: 0,
      entrances: [{ x: 15, y: 5, interiorX: 15, interiorY: 5, toLevelId: 41, side: null, kind: 'gate' }],
    })
    const rockyWaste = makeMockLevelView({
      areaId: 41,
      tileOriginX: 15,
      tileOriginY: 0,
      entrances: [{ x: 0, y: 5, interiorX: 0, interiorY: 5, toLevelId: 40, side: null, kind: 'gate' }],
    })

    const mockMapService = {
      getActiveAct: () => 1,
      loadAct: () => lutGholein,
      getLevelView: (id: number) => (id === 40 ? lutGholein : rockyWaste),
      peekLevelView: (id: number) => (id === 40 ? lutGholein : rockyWaste),
      getLoadedLevelView: (id: number) => (id === 40 ? lutGholein : rockyWaste),
      getConnectedLevelViews: (id: number) => (id === 40 ? [rockyWaste] : [lutGholein]),
    } as unknown as MapService

    const automapView = new AutomapView({ mapService: mockMapService, initialMode: 'off' })
    automapView.setContext(0x12345678, 1, 40, lutGholein)

    const minimapLevel = automapView.buildMinimapLevel('ENG')
    const exitMarkers = minimapLevel.markers.filter((m) => m.kind === 'exit')

    // Must have exactly 1 outward exit marker (toLevelId: 41 Rocky Waste), NOT two overlapping markers!
    expect(exitMarkers).toHaveLength(1)
    expect(exitMarkers[0]!.toLevelId).toBe(41)
    expect(exitMarkers[0]!.targetName).toContain('Rocky Waste')
  })
})

describe('Issue #1369: Poison Cloud trans75 & Double Tinting Elimination', () => {
  it('configures poison clouds and puffs to trans75 alpha blend mode to prevent additive blowout', () => {
    expect(MISSILE_METAS['corpsepoisoncloud']?.blendMode).toBe('trans75')
    expect(MISSILE_METAS['corpsepoisoncloud']?.trans).toBe(2)

    expect(MISSILE_METAS['poisonpuff']?.blendMode).toBe('trans75')
    expect(MISSILE_METAS['poisonpuff']?.trans).toBe(2)

    expect(MISSILE_METAS['poisonjavcloud']?.blendMode).toBe('trans75')
    expect(MISSILE_METAS['poisonjavcloud']?.trans).toBe(2)

    expect(MISSILE_METAS['plaguejavcloud']?.blendMode).toBe('trans75')
    expect(MISSILE_METAS['plaguejavcloud']?.trans).toBe(2)
  })

  it('eliminates double tinting by suppressing RGB tintColor when an active paletteRow shift is present', () => {
    const drawables = buildSceneDrawables({
      units: [
        {
          id: 1,
          kind: 'player',
          classId: 0,
          mode: 1,
          x: 10,
          y: 10,
          states: [1], // Active freeze state (paletteRow: 1)
        } as unknown as RenderableUnitInput,
      ],
      elapsedMs: 0,
    })

    const playerDrawable = drawables.unitDrawables.find((d) => d.id === 1)
    expect(playerDrawable).toBeDefined()
    expect(playerDrawable!.paletteRow).toBe(1)
    // tintColor MUST be null when paletteRow > 0 to prevent multiplicative blowout / severe darkening
    expect(playerDrawable!.tintColor).toBeNull()
  })

  it('guarantees poisonpuff spawn on the final missile tick when remaining ticks reaches 0', () => {
    const seed = { lo: 12345, hi: 666 }
    // On the final frame (remainingTicks = 0), rollPoisonCloudPuffTargets113c must always spawn puffs
    const puffs = rollPoisonCloudPuffTargets113c(seed, 0, 10, 10, 4, 1, 3)
    expect(puffs.length).toBeGreaterThan(0)
  })
})

describe('Issue #1370: Widescreen Viewport Boundary Convergence & Skirt Fill', () => {
  it('converges camera safely in widescreen when corners overshoot outdoor map boundaries without neighbours', () => {
    const levelView = makeMockLevelView({
      areaId: 2,
      tileOriginX: 0,
      tileOriginY: 0,
      cellsX: 16,
      cellsY: 16,
    })
    const profileWidescreen = getViewportProfile('1068x600')

    // At bottom-right corner of the level:
    // baseCamX and baseCamY configured near the boundary
    const baseCamX = 800
    const baseCamY = 800

    const converged = computeConvergedCameraTopLeft(
      baseCamX,
      baseCamY,
      profileWidescreen,
      levelView,
      [],
    )

    // Camera converged inward (shifted left)
    expect(converged.x).toBeLessThan(baseCamX)
    expect(converged.y).toBeLessThanOrEqual(baseCamY)

    // The shift does not exceed the allowed widescreen convergence bounds
    const maxShiftX = Math.round((1068 - 800) / 2)
    expect(baseCamX - converged.x).toBeLessThanOrEqual(maxShiftX)

    // In 1280x720, height also expands from 600 to 720, so Y converges upward
    const profile720 = getViewportProfile('1280x720')
    const converged720 = computeConvergedCameraTopLeft(
      baseCamX,
      baseCamY,
      profile720,
      levelView,
      [],
    )
    expect(converged720.x).toBeLessThan(baseCamX)
    expect(converged720.y).toBeLessThan(baseCamY)
  })

  it('leaves camera coordinates strictly untouched in standard 800x600 mode', () => {
    const levelView = makeMockLevelView({
      areaId: 2,
      tileOriginX: 0,
      tileOriginY: 0,
      cellsX: 16,
      cellsY: 16,
    })
    const profileStandard = getViewportProfile('800x600')
    const baseCamX = 800
    const baseCamY = 800

    const result = computeConvergedCameraTopLeft(
      baseCamX,
      baseCamY,
      profileStandard,
      levelView,
      [],
    )
    expect(result.x).toBe(baseCamX)
    expect(result.y).toBe(baseCamY)
  })

  it('generates border skirt floor quads in widescreen mode for visible frustum cells outside map diamond', () => {
    const sampleFloor: LevelDrawItem = {
      x: 0,
      y: 0,
      cellX: 0,
      cellY: 0,
      act: 1,
      library: 1,
      tile: 1,
      dt1Path: 'test.dt1',
      placement: { act: 1, page: 0, x: 0, y: 0, width: 80, height: 40 },
      blockCount: 1,
      frameIndex: 0,
    } as unknown as LevelDrawItem

    const levelView = makeMockLevelView({
      areaId: 2,
      tileOriginX: 0,
      tileOriginY: 0,
      cellsX: 4,
      cellsY: 4,
      floors: [sampleFloor],
    })

    const source = new ClientWorldSceneSource(
      () => ({
        tick: 1,
        actId: 1,
        levelId: 2,
        playerSubX: 10,
        playerSubY: 10,
        ambient: null,
        levelView,
        neighbourLevelViews: [],
        units: [],
      }),
      '1068x600',
    )

    const snapshot = source.buildFrameSnapshot(240)
    // Any cells outside [0..cellsX, 0..cellsY] that are visible must have skirt quads
    const outOfBoundsQuads = snapshot.floorQuads.filter(
      (q) => q.cellX < 0 || q.cellX >= 4 || q.cellY < 0 || q.cellY >= 4,
    )
    expect(outOfBoundsQuads.length).toBeGreaterThan(0)
  })
})

describe('Issue #1371: Corner Minimap Clearance & Dummy Shrine Exclusion', () => {
  it('shifts corner minimap viewport down to y = 120 and centerY = 232 to clear room HUD text', () => {
    const vp = computeAutomapViewport(800, 600, true)
    expect(vp.y).toBe(120)
    expect(vp.centerY).toBe(232)
  })

  it('excludes dummy shrine objects (86, 120, 301, 319, 625) from shrine names and overhead overlays', () => {
    for (const classId of [86, 120, 301, 319]) {
      const meta = CANONICAL_113C_OBJECTS[classId]
      expect(meta?.isShrine).toBeFalsy()
      expect(resolveObjectName(classId, 0, 1, 1)).toBeUndefined()
      expect(resolveShrineOverlays113c(classId, 6, 1)).toBeUndefined()
    }

    // Object 625 (InactiveStoneDesertShrine)
    expect(resolveObjectName(625, 0, 1, 1)).toBeUndefined()
    expect(resolveShrineOverlays113c(625, 6, 1)).toBeUndefined()
  })
})
