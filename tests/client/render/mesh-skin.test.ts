import { describe, expect, it } from 'vitest'
import { parseGlbContainer } from '../../../src/common/formats/glb-reader.ts'
import { validateCharacterSkinManifest } from '../../../src/common/units/character-skin.ts'
import {
  computeMeshSkinJointMatrices,
  createMeshSkinPose,
  meshSkinBillboardBasis,
  meshSkinCameraRotation,
  parseMeshSkinModel,
  resolveMeshSkinOneShotTimeMs,
  sampleMeshSkinClip,
  shortestDir64Delta,
  skinMeshSkinGeoset,
} from '../../../src/common/units/mesh-skin-model.ts'
import { MESH_SKIN_BLEND_MS, MeshSkinAnimator } from '../../../src/client/render/mesh-skin-animator.ts'
import { CharacterSkinService } from '../../../src/client/render/character-skin-cache.ts'
import { PLR_MODES } from '../../../src/common/units/plr-mode.ts'

const PLAYER_MODE_TOKENS_FOR_TEST = PLR_MODES.map((m) => m.token.toLowerCase()).filter((t) => t !== 'sq')
const MONSTER_MODES_FOR_TEST = ['dt', 'nu', 'wl', 'gh', 'a1', 'a2', 'bl', 'sc', 's1', 's2', 's3', 's4', 'dd', 'xx', 'rn']

/**
 * Builds a tiny valid mesh skin GLB: a root joint and a child joint at pivot (0, 0, 10), one
 * triangle bound to the child, and clips that rotate / move the child.
 */
function buildTestGlb(options: { readonly clipNames?: readonly string[]; readonly billboardChild?: boolean } = {}): Uint8Array {
  const chunks: Uint8Array[] = []
  const views: { buffer: 0; byteOffset: number; byteLength: number }[] = []
  const accessors: Record<string, unknown>[] = []
  let offset = 0
  const push = (bytes: Uint8Array): number => {
    const pad = (4 - (offset % 4)) % 4
    if (pad > 0) {
      chunks.push(new Uint8Array(pad))
      offset += pad
    }
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength })
    chunks.push(bytes)
    offset += bytes.byteLength
    return views.length - 1
  }
  const f32 = (values: readonly number[], type: string, count: number): number => {
    accessors.push({
      bufferView: push(new Uint8Array(new Float32Array(values).buffer)),
      componentType: 5126,
      count,
      type,
    })
    return accessors.length - 1
  }
  const u16 = (values: readonly number[], type: string, count: number): number => {
    accessors.push({
      bufferView: push(new Uint8Array(new Uint16Array(values).buffer)),
      componentType: 5123,
      count,
      type,
    })
    return accessors.length - 1
  }

  const identityAt = (tx: number, ty: number, tz: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1]
  const ibm = f32([...identityAt(0, 0, 0), ...identityAt(0, 0, -10)], 'MAT4', 2)
  const position = f32([1, 0, 10, 0, 1, 10, 0, 0, 12], 'VEC3', 3)
  const normal = f32([1, 0, 0, 1, 0, 0, 1, 0, 0], 'VEC3', 3)
  const uv = f32([0, 0, 1, 0, 0, 1], 'VEC2', 3)
  const joints = u16([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 'VEC4', 3)
  const weights = f32([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 'VEC4', 3)
  const indices = u16([0, 1, 2], 'SCALAR', 3)

  const half = Math.SQRT1_2
  const animations = (options.clipNames ?? ['nu', 'wl', 'a1', 'gh', 'dt']).map((name) => {
    const input = f32([0, 1], 'SCALAR', 2)
    // 90 degrees about +Z over one second.
    const rotation = f32([0, 0, 0, 1, 0, 0, half, half], 'VEC4', 2)
    const alphaIn = f32([0, 0.5], 'SCALAR', 2)
    const alphaOut = f32([1, 0], 'SCALAR', 2)
    return {
      name,
      samplers: [{ input, output: rotation, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }],
      extras: {
        durationMs: 1000,
        loop: name === 'nu' || name === 'wl',
        geosetAlpha: name === 'dt' ? [{ geoset: 0, input: alphaIn, output: alphaOut, interpolation: 'STEP' }] : [],
      },
    }
  })

  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 2] }],
    nodes: [
      { name: 'root', translation: [0, 0, 0], children: [1] },
      {
        name: 'child',
        translation: [0, 0, 10],
        ...(options.billboardChild ? { extras: { billboard: true } } : {}),
      },
      { name: 'mesh', mesh: 0, skin: 0 },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: uv, JOINTS_0: joints, WEIGHTS_0: weights },
            indices,
            material: 0,
            extras: { geoset: 0, layer: 0, alpha: 1, color: [1, 1, 1] },
          },
        ],
      },
    ],
    skins: [{ joints: [0, 1], inverseBindMatrices: ibm }],
    materials: [
      {
        pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0.25, 1] },
        extras: { filterMode: 0, unshaded: false, texAnim: -1 },
      },
    ],
    animations,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: 0 }],
  }

  const binLength = offset + ((4 - (offset % 4)) % 4)
  const bin = new Uint8Array(binLength)
  let at = 0
  for (const c of chunks) {
    bin.set(c, at)
    at += c.byteLength
  }
  json.buffers[0]!.byteLength = binLength
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  if (jsonBytes.byteLength % 4 !== 0) {
    const padded = new Uint8Array(jsonBytes.byteLength + (4 - (jsonBytes.byteLength % 4))).fill(0x20)
    padded.set(jsonBytes)
    jsonBytes = padded
  }
  const total = 12 + 8 + jsonBytes.byteLength + 8 + bin.byteLength
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonBytes.byteLength, true)
  dv.setUint32(16, 0x4e4f534a, true)
  out.set(jsonBytes, 20)
  const binAt = 20 + jsonBytes.byteLength
  dv.setUint32(binAt, bin.byteLength, true)
  dv.setUint32(binAt + 4, 0x004e4942, true)
  out.set(bin, binAt + 8)
  return out
}

function meshManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const clip = (loop: boolean, extra: Record<string, unknown> = {}) => ({ anim: 'nu', loop, durationMs: 1000, ...extra })
  const mesh = (clips: Record<string, unknown>) => ({
    file: 'model.glb',
    pxPerUnit: 0.5,
    box: { width: 150, height: 160, footX: 75, footY: 120 },
    clips,
  })
  return {
    schema: 2,
    id: 'ne-test-mesh',
    name: { zh: '测试', en: 'Test' },
    targetClass: 'ne',
    format: 'mesh',
    directions: 64,
    mesh: mesh({ nu: clip(true), wl: clip(true, { moveSpeed: 200 }), a1: clip(false, { actionAt: 0.46 }), dt: clip(false) }),
    minions: {
      claygolem: {
        name: { zh: '憎恶', en: 'Abomination' },
        directions: 64,
        portraitFile: 'portrait.png',
        mesh: mesh({ nu: clip(true), wl: clip(true), a1: clip(false), gh: clip(false), dt: clip(false) }),
      },
    },
    ...overrides,
  }
}

describe('Mesh skin GLB model, pose sampling and CPU skinning', () => {
  it('parses the GLB layout and rejects malformed containers and models', () => {
    const model = parseMeshSkinModel(buildTestGlb())
    expect(model.nodeCount).toBe(2)
    expect([...model.parents]).toEqual([-1, 0])
    expect([...model.order]).toEqual([0, 1])
    expect([...model.pivots]).toEqual([0, 0, 0, 0, 0, 10])
    expect(model.geosets).toHaveLength(1)
    expect(model.geosets[0]!.layers[0]!.color).toEqual([1, 0.5, 0.25])
    expect(Object.keys(model.clips).sort()).toEqual(['a1', 'dt', 'gh', 'nu', 'wl'])
    expect(model.clips.nu!.loop).toBe(true)
    expect(model.clips.a1!.loop).toBe(false)

    expect(() => parseGlbContainer(new Uint8Array(8))).toThrow(/shorter than its header/)
    const badMagic = buildTestGlb()
    badMagic[0] = 0
    expect(() => parseMeshSkinModel(badMagic)).toThrow(/bad magic/)
    expect(() => parseMeshSkinModel(buildTestGlb({ clipNames: [] }))).toThrow(/no animations/)
    expect(() => parseMeshSkinModel(buildTestGlb({ clipNames: ['nu', 'nu'] }))).toThrow(/duplicate animation name/)
  })

  it('samples clips, rotates joints about their pivot and skins vertices', () => {
    const model = parseMeshSkinModel(buildTestGlb())
    const pose = createMeshSkinPose(model)
    const globals = new Float32Array(model.nodeCount * 12)
    const joints = new Float32Array(model.nodeCount * 12)
    const out = new Float32Array(model.maxVertexCount * 8)
    const skinAt = (clip: string, timeMs: number): number[] => {
      sampleMeshSkinClip(model, model.clips[clip]!, timeMs, pose)
      computeMeshSkinJointMatrices(model, pose, null, globals, joints)
      skinMeshSkinGeoset(model.geosets[0]!, joints, out)
      return [...out.subarray(0, 3)].map((v) => Math.round(v * 1000) / 1000)
    }
    // Rest pose: vertex 0 stays at (1, 0, 10).
    expect(skinAt('nu', 0)).toEqual([1, 0, 10])
    // End of clip: 90 degrees about +Z around the pivot moves +X to +Y at the same height.
    expect(skinAt('nu', 1000)).toEqual([0, 1, 10])
    // Halfway is a 45 degree turn (spherical interpolation keeps the radius).
    expect(skinAt('nu', 500)).toEqual([0.707, 0.707, 10])
    // Times outside the clip clamp instead of extrapolating.
    expect(skinAt('nu', 5000)).toEqual([0, 1, 10])
    expect(skinAt('nu', -50)).toEqual([1, 0, 10])

    // STEP visibility track: visible before 500 ms, hidden from 500 ms on.
    sampleMeshSkinClip(model, model.clips.dt!, 499, pose)
    expect(pose.geosetAlpha[0]).toBe(1)
    sampleMeshSkinClip(model, model.clips.dt!, 500, pose)
    expect(pose.geosetAlpha[0]).toBe(0)
    // Clips without the track keep the static geoset alpha.
    sampleMeshSkinClip(model, model.clips.nu!, 900, pose)
    expect(pose.geosetAlpha[0]).toBe(1)
  })

  it('orients billboard nodes towards the camera for every facing', () => {
    const model = parseMeshSkinModel(buildTestGlb({ billboardChild: true }))
    const pose = createMeshSkinPose(model)
    const globals = new Float32Array(model.nodeCount * 12)
    const joints = new Float32Array(model.nodeCount * 12)
    const rot = new Float32Array(9)
    const basis = new Float32Array(9)
    for (const dir64 of [0, 7, 16, 23.5, 32, 48, 63]) {
      meshSkinCameraRotation(dir64, rot)
      // The camera rotation must be orthonormal for every facing.
      for (let r = 0; r < 3; r += 1) {
        expect(Math.hypot(rot[r * 3]!, rot[r * 3 + 1]!, rot[r * 3 + 2]!)).toBeCloseTo(1, 5)
      }
      meshSkinBillboardBasis(rot, basis)
      sampleMeshSkinClip(model, model.clips.nu!, 300, pose)
      computeMeshSkinJointMatrices(model, pose, basis, globals, joints)
      // The billboard joint's local +X axis, taken to camera space, points straight at the viewer.
      const ax = joints[12]!, ay = joints[16]!, az = joints[20]!
      const camX = rot[0]! * ax + rot[1]! * ay + rot[2]! * az
      const camY = rot[3]! * ax + rot[4]! * ay + rot[5]! * az
      const camZ = rot[6]! * ax + rot[7]! * ay + rot[8]! * az
      expect(camX).toBeCloseTo(0, 5)
      expect(camY).toBeCloseTo(0, 5)
      expect(camZ).toBeCloseTo(1, 5)
    }
    // dir64 0 faces screen south: model forward (+X) projects straight down the screen, towards the viewer.
    meshSkinCameraRotation(0, rot)
    expect(rot[0]).toBeCloseTo(0, 6)
    expect(rot[3]!).toBeGreaterThan(0)
    expect(rot[6]!).toBeGreaterThan(0)
  })
})

describe('Mesh skin timing', () => {
  it('maps one-shot progress monotonically and lands the action point on the gameplay hit', () => {
    expect(resolveMeshSkinOneShotTimeMs(1000, 0.5)).toBe(500)
    expect(resolveMeshSkinOneShotTimeMs(1000, -1)).toBe(0)
    expect(resolveMeshSkinOneShotTimeMs(1000, 7)).toBe(1000)
    // Gameplay hits at 60% of the action; the clip's impact is at 46% of the animation.
    expect(resolveMeshSkinOneShotTimeMs(1000, 0.6, 0.6, 0.46)).toBeCloseTo(460, 6)
    expect(resolveMeshSkinOneShotTimeMs(1000, 0, 0.6, 0.46)).toBe(0)
    expect(resolveMeshSkinOneShotTimeMs(1000, 1, 0.6, 0.46)).toBeCloseTo(1000, 6)
    let prev = -1
    for (let i = 0; i <= 200; i += 1) {
      const t = resolveMeshSkinOneShotTimeMs(1000, i / 200, 0.6, 0.46)
      expect(t).toBeGreaterThanOrEqual(prev)
      prev = t
    }
    // An action point at the very start or end cannot be aligned and falls back to linear.
    expect(resolveMeshSkinOneShotTimeMs(1000, 0.25, 0, 0.46)).toBe(250)
    expect(resolveMeshSkinOneShotTimeMs(1000, 0.25, 0.6, 1)).toBe(250)

    expect(shortestDir64Delta(60, 2)).toBe(6)
    expect(shortestDir64Delta(2, 60)).toBe(-6)
    expect(shortestDir64Delta(0, 32)).toBe(32)
  })

  it('advances loops every display frame, cross-fades clip changes and smooths facing', () => {
    const model = parseMeshSkinModel(buildTestGlb())
    const animator = new MeshSkinAnimator()
    const base = { unitKey: 'player:1', model, worldX: 100, worldY: 100, dir64: 0 }

    // 60 Hz for one second: every frame samples a new pose (the old sprites managed 12.5 to 25).
    const times = new Set<number>()
    for (let i = 0; i <= 60; i += 1) {
      const res = animator.play({ ...base, clip: model.clips.nu!, mode: 'loop', nowMs: 1000 + (i * 1000) / 60 })
      if (i > 0) times.add(Math.round(res.timeMs * 100))
    }
    expect(times.size).toBe(60)

    // Switching clips keeps part of the previous pose for MESH_SKIN_BLEND_MS, then follows the new clip.
    const idleEnd = animator.play({ ...base, clip: model.clips.nu!, mode: 'loop', nowMs: 2010 })
    const idleRotZ = idleEnd.pose.rotation[1 * 4 + 2]!
    const justSwitched = animator.play({ ...base, clip: model.clips.a1!, mode: 'oneshot', timeMs: 0, nowMs: 2020 })
    const blendedRotZ = justSwitched.pose.rotation[1 * 4 + 2]!
    expect(blendedRotZ).toBeGreaterThan(0)
    expect(blendedRotZ).toBeLessThanOrEqual(idleRotZ + 1e-6)
    const settled = animator.play({
      ...base,
      clip: model.clips.a1!,
      mode: 'oneshot',
      timeMs: 0,
      nowMs: 2020 + MESH_SKIN_BLEND_MS + 1,
    })
    expect(settled.pose.rotation[1 * 4 + 2]).toBeCloseTo(0, 6)

    // 'hold-end' pins the final frame (corpses).
    const held = animator.play({ ...base, clip: model.clips.dt!, mode: 'hold-end', nowMs: 2200 })
    expect(held.timeMs).toBe(1000)

    // Facing turns through intermediate angles instead of snapping between 8 directions.
    const turning = animator.play({ ...base, clip: model.clips.dt!, mode: 'hold-end', nowMs: 2216, dir64: 32 })
    expect(turning.dir64).toBeGreaterThan(0)
    expect(turning.dir64).toBeLessThan(32)
    let facing = turning.dir64
    for (let i = 1; i <= 40; i += 1) {
      facing = animator.play({ ...base, clip: model.clips.dt!, mode: 'hold-end', nowMs: 2216 + i * 16, dir64: 32 }).dir64
    }
    expect(facing).toBeCloseTo(32, 6)

    // A slow display (5 frames per second) still advances loops by the real elapsed time.
    const slow = new MeshSkinAnimator()
    slow.play({ ...base, unitKey: 'slow', clip: model.clips.nu!, mode: 'loop', nowMs: 0 })
    expect(slow.play({ ...base, unitKey: 'slow', clip: model.clips.nu!, mode: 'loop', nowMs: 200 }).timeMs).toBe(200)
    expect(slow.play({ ...base, unitKey: 'slow', clip: model.clips.nu!, mode: 'loop', nowMs: 400 }).timeMs).toBe(400)

    // A unit that was off screen for a while restarts cleanly (no blend, facing snaps).
    const back = animator.play({ ...base, clip: model.clips.nu!, mode: 'loop', nowMs: 9000, dir64: 8 })
    expect(back.dir64).toBe(8)
    expect(back.timeMs).toBe(0)
  })

  it('plays locomotion at the rate that matches measured ground speed', () => {
    const model = parseMeshSkinModel(buildTestGlb())
    const clip = model.clips.wl!
    const advance = (speedPxPerSec: number): number => {
      const animator = new MeshSkinAnimator()
      let last = 0
      let lastTime = 0
      // Warm the speed estimate up for a second, then measure clip time gained over 320 ms.
      for (let i = 0; i <= 80; i += 1) {
        const nowMs = 1000 + i * 16
        const res = animator.play({
          unitKey: 'monster:5',
          model,
          clip,
          mode: 'loop',
          naturalSpeedPx: 100,
          nowMs,
          dir64: 48,
          worldX: (speedPxPerSec * (nowMs - 1000)) / 1000,
          worldY: 0,
        })
        if (i === 60) lastTime = res.timeMs
        if (i === 80) last = (res.timeMs - lastTime + 1000) % 1000
      }
      return last / 320
    }
    // Moving exactly at the authored speed plays at rate 1; twice as fast plays at rate 2.
    expect(advance(100)).toBeCloseTo(1, 1)
    expect(advance(200)).toBeCloseTo(2, 1)
    // The rate is clamped so a nearly stationary unit does not freeze mid-stride.
    expect(advance(5)).toBeCloseTo(0.5, 1)
  })
})

describe('Mesh skin manifest (schema 2) and service wiring', () => {
  it('accepts mesh manifests and rejects inconsistent ones', () => {
    const manifest = validateCharacterSkinManifest(meshManifest())
    expect(manifest.schema).toBe(2)
    expect(manifest.format).toBe('mesh')
    expect(manifest.pages).toEqual([])
    expect(manifest.mesh?.clips.a1?.actionAt).toBe(0.46)
    expect(manifest.mesh?.clips.wl?.moveSpeed).toBe(200)
    expect(manifest.minions?.claygolem?.mesh?.file).toBe('model.glb')

    expect(() => validateCharacterSkinManifest(meshManifest({ schema: 1 }))).toThrow(/does not match schema/)
    expect(() => validateCharacterSkinManifest(meshManifest({ mesh: undefined }))).toThrow(/expected mesh object/)
    const noDeath = meshManifest()
    delete ((noDeath.mesh as { clips: Record<string, unknown> }).clips as Record<string, unknown>).dt
    expect(() => validateCharacterSkinManifest(noDeath)).toThrow(/missing required clip "dt"/)
    const badFile = meshManifest()
    ;(badFile.mesh as { file: string }).file = '../evil.glb'
    expect(() => validateCharacterSkinManifest(badFile)).toThrow(/expected a relative \.glb file/)
    const badAction = meshManifest()
    ;((badAction.mesh as { clips: Record<string, { actionAt?: number }> }).clips.a1 as { actionAt?: number }).actionAt = 1
    expect(() => validateCharacterSkinManifest(badAction)).toThrow(/actionAt/)
    const minionNoHit = meshManifest()
    const golem = (minionNoHit.minions as Record<string, { mesh: { clips: Record<string, unknown> } }>).claygolem!
    delete golem.mesh.clips.gh
    expect(() => validateCharacterSkinManifest(minionNoHit)).toThrow(/missing required clip "gh"/)

    // Reserved fields for future art sources are validated and carried, not dropped.
    const reserved = meshManifest()
    ;(reserved.mesh as Record<string, unknown>).components = { helm: 'helm.glb' }
    ;(reserved.mesh as Record<string, unknown>).materialMaps = { normal: 'body_n.png' }
    const withReserved = validateCharacterSkinManifest(reserved)
    expect(withReserved.mesh?.components).toEqual({ helm: 'helm.glb' })
    expect(withReserved.mesh?.materialMaps).toEqual({ normal: 'body_n.png' })
  })

  it('covers every player and monster mode token through the mesh clip tables', async () => {
    const { resolveSkinClipKey, resolveMinionClipKey } = await import('../../../src/common/units/character-skin.ts')
    const manifest = validateCharacterSkinManifest(meshManifest())
    for (const token of PLAYER_MODE_TOKENS_FOR_TEST) {
      const key = resolveSkinClipKey('ne', token, manifest.mesh!.clips)
      expect(key, `player mode ${token}`).not.toBeNull()
      expect(manifest.mesh!.clips[key!]).toBeDefined()
    }
    const minionClips = manifest.minions!.claygolem!.mesh!.clips
    for (const token of MONSTER_MODES_FOR_TEST) {
      const key = resolveMinionClipKey(token, minionClips)
      expect(key, `monster mode ${token}`).not.toBeNull()
      expect(minionClips[key!]).toBeDefined()
    }
  })

  it('reports mesh manifests to the render loop and never builds sprite atlases for them', async () => {
    const manifest = validateCharacterSkinManifest(meshManifest({ id: 'ne-kelthuzad' }))
    const fetched: string[] = []
    const service = new CharacterSkinService({
      skinsBaseUrl: '/skins',
      disableIndexedDb: true,
      fetchFn: (async (url: string | URL | Request) => {
        const u = String(url)
        fetched.push(u)
        if (u.endsWith('/skins/index.json')) return new Response('missing', { status: 404 })
        if (u.endsWith('/skins/ne-kelthuzad/skin.json')) return new Response(JSON.stringify(manifest), { status: 200 })
        return new Response('missing', { status: 404 })
      }) as typeof fetch,
    })

    // Disabled: nothing is fetched and nothing is selected.
    expect(service.peekSelectedManifest('ne')).toBeNull()
    expect(fetched).toEqual([])

    service.setConfig({ enabled: true, selectedByClass: { ne: 'ne-kelthuzad' } })
    expect(service.peekSelectedManifest('ne')).toBe('loading')
    for (let i = 0; i < 20 && service.peekSelectedManifest('ne') === 'loading'; i += 1) {
      await new Promise((r) => setTimeout(r, 5))
    }
    const peeked = service.peekSelectedManifest('ne')
    expect(peeked).not.toBe('loading')
    expect(peeked !== null && peeked !== 'loading' ? peeked.format : null).toBe('mesh')
    // Only the manifest was fetched: no model, texture or portrait before a unit is drawn.
    expect(fetched.filter((u) => u.endsWith('.glb') || u.endsWith('.png'))).toEqual([])

    // Summon names and portraits still come from the same minion entries.
    expect(service.getSelectedMinionSpec('ne', 'claygolem')?.name.zh).toBe('憎恶')
    // The campfire avatar is a sprite feature; mesh skins opt out instead of crashing on empty atlases.
    expect(await service.ensureSkinAvatar('ne')).toBeNull()
  })
})
