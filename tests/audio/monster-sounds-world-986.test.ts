import { describe, expect, it } from 'vitest'
import {
  MON_STATS_SOUND_BY_HCIDX_113C,
  SUPER_UNIQUE_MON_SOUND_BY_ID_113C,
  convertMonsterSoundMode113c,
  resolveMonsterSoundProfileId113c,
  resolveUnitMonSoundRow113c,
} from '../../src/common/audio/mon-sounds-113c.ts'
import { ClientWorld } from '../../src/client/world/client-world.ts'
import { AudioRuntime113c } from '../../src/client/audio/audio-runtime-113c.ts'

describe('Issue #986: 1.13c MonStats/MonSounds monster SFX in ClientWorld & AudioRuntime113c', () => {
  it('resolves MonStats.txt hcIdx (MonSound / UMonSound) and SuperUniques.txt overrides', () => {
    expect(MON_STATS_SOUND_BY_HCIDX_113C.length).toBe(734)
    expect(MON_STATS_SOUND_BY_HCIDX_113C[5]).toEqual(['zombie1', 'zombie', 'zombieunique'])
    expect(MON_STATS_SOUND_BY_HCIDX_113C[19]).toEqual(['fallen1', 'fallen', 'fallen'])
    expect(MON_STATS_SOUND_BY_HCIDX_113C[58]).toEqual(['fallenshaman1', 'fallenshaman', 'fallenshaman'])
    expect(SUPER_UNIQUE_MON_SOUND_BY_ID_113C[6]).toBe('countess')
    expect(SUPER_UNIQUE_MON_SOUND_BY_ID_113C[20]).toBe('smith')
    expect(SUPER_UNIQUE_MON_SOUND_BY_ID_113C[41]).toBe('smithdemon')

    expect(resolveMonsterSoundProfileId113c({ classId: 19 })).toBe('fallen')
    expect(resolveMonsterSoundProfileId113c({ classId: 5 })).toBe('zombie')
    expect(resolveMonsterSoundProfileId113c({ classId: 5, isUnique: true })).toBe('zombieunique')
    expect(resolveMonsterSoundProfileId113c({ classId: 5, isChampion: true })).toBe('zombieunique')
    expect(
      resolveMonsterSoundProfileId113c({
        classId: 45,
        isSuperUnique: true,
        superUniqueId: 6,
      }),
    ).toBe('countess')
  })

  it('emits Fallen (hcIdx=19) Attack1+Weapon1, Footstep, HitSound (0x0C & GH), and DeathSound in ClientWorld', () => {
    const world = new ClientWorld()
    world.apply({
      type: 'UnitAssign',
      unit: {
        unitType: 1,
        id: 501,
        classId: 19, // fallen1 (MonSound='fallen': attack1=890, weapon1=251, hitSound=895, deathSound=900, footstep=2720)
        x: 5100,
        y: 5100,
        mode: 1,
        lifePct: 128,
      },
    })
    world.drainWorldSoundRequests()

    // 1. Attack1 (890, delay=0) + Weapon1 (251, delay=5, vol=160) on A1 (mode=4)
    world.apply({
      type: 'UnitMode',
      unitType: 1,
      id: 501,
      mode: 4,
      at: { x: 5100, y: 5100 },
    })
    const a1Reqs = world.drainWorldSoundRequests()
    const wep1 = a1Reqs.find((r) => r.soundId === 251)
    expect(wep1).toBeDefined()
    expect(wep1?.delayTicks).toBe(5)
    expect(wep1?.volume).toBe(160)
    for (const r of a1Reqs) {
      expect([890, 251]).toContain(r.soundId)
    }

    // 2. Walk (mode=2) -> Footstep (2720)
    world.apply({
      type: 'UnitMode',
      unitType: 1,
      id: 501,
      mode: 2,
      at: { x: 5102, y: 5102 },
    })
    const wlReqs = world.drainWorldSoundRequests()
    expect(wlReqs.map((r) => r.soundId)).toContain(2720)

    // 3. 0x0C NPCGetHit (mode === undefined && hitClass !== undefined) -> HitSound (895, delay=2)
    world.apply({
      type: 'UnitMode',
      unitType: 1,
      id: 501,
      lifePct: 96,
      hitClass: 32,
    })
    const hit0cReqs = world.drainWorldSoundRequests()
    expect(hit0cReqs).toHaveLength(1)
    expect(hit0cReqs[0]?.soundId).toBe(895)
    expect(hit0cReqs[0]?.delayTicks).toBe(2)

    // 4. Mode 3 (GH) -> HitSound (895, delay=2)
    world.apply({
      type: 'UnitMode',
      unitType: 1,
      id: 501,
      mode: 3,
      lifePct: 64,
      hitClass: 32,
    })
    const ghReqs = world.drainWorldSoundRequests()
    expect(ghReqs).toHaveLength(1)
    expect(ghReqs[0]?.soundId).toBe(895)

    // 5. Mode 0 (DT) -> Fallen DeathSound (900, delay=1), NOT hardcoded 1094 (thornhulk)
    world.apply({
      type: 'UnitMode',
      unitType: 1,
      id: 501,
      mode: 0,
      lifePct: 0,
    })
    const dtReqs = world.drainWorldSoundRequests()
    expect(dtReqs.some((r) => r.soundId === 900 && r.delayTicks === 1)).toBe(true)
    expect(dtReqs.some((r) => r.soundId === 1094)).toBe(false)
  })

  it('converts Fallen Shaman (hcIdx=58) A2 + Resurrect (#181) to S1 (Skill1 = 938) via CvtMo1/CvtSk1/CvtTgt1', () => {
    const shamanRow = resolveUnitMonSoundRow113c({ classId: 58 })
    expect(shamanRow).toBeDefined()
    expect(shamanRow?.id).toBe('fallenshaman')
    expect(convertMonsterSoundMode113c(shamanRow!, 5, 181)).toBe(8)
    expect(convertMonsterSoundMode113c(shamanRow!, 5, 36)).toBe(5)

    const world = new ClientWorld()
    world.apply({
      type: 'UnitAssign',
      unit: {
        unitType: 1,
        id: 601,
        classId: 58, // fallenshaman1
        x: 5120,
        y: 5120,
        mode: 1,
        lifePct: 128,
      },
    })
    world.drainWorldSoundRequests()

    // Shaman casts Resurrect (skillId=181, anim mode A2=5 -> converted to S1=8 -> skill1=938)
    world.apply({
      type: 'SkillCast',
      caster: { unitType: 1, id: 601 },
      skill: 181,
      level: 1,
      target: { x: 5100, y: 5100 },
    })
    const castReqs = world.drainWorldSoundRequests()
    expect(castReqs.map((r) => r.soundId)).toContain(938)
  })

  it('emits Init sound on UnitAssign and periodic Neutral sound (907) when living monster ticks in MONMODE_NEUTRAL (1)', () => {
    const world = new ClientWorld()
    // Compelling Orb (hcIdx=366, MonSound='compellingorb', init=667) emits Init on UnitAssign
    world.apply({
      type: 'UnitAssign',
      unit: {
        unitType: 1,
        id: 700,
        classId: 366,
        x: 5090,
        y: 5090,
        mode: 1,
        lifePct: 128,
      },
    })
    expect(world.drainWorldSoundRequests().map((r) => r.soundId)).toContain(667)

    world.apply({
      type: 'UnitAssign',
      unit: {
        unitType: 1,
        id: 701,
        classId: 19, // fallen1: Neutral=907, NeuTime=300
        x: 5100,
        y: 5100,
        mode: 1,
        lifePct: 128,
      },
    })
    world.drainWorldSoundRequests()

    let neutralEmitted = false
    for (let i = 0; i < 610; i++) {
      world.tick(40)
      const reqs = world.drainWorldSoundRequests()
      if (reqs.some((r) => r.soundId === 907)) {
        neutralEmitted = true
        break
      }
    }
    expect(neutralEmitted).toBe(true)
  })

  it('prefetches sfx-mon-global alongside act monster packs in preloadMonsterPacksForAct', () => {
    const prefetched: string[] = []
    const runtime = new AudioRuntime113c({
      loader: {
        prefetch: (packId: string) => {
          prefetched.push(packId)
        },
        getSoundBuffer: () => null,
        ensureSoundBuffer: async () => null,
      } as any,
    })
    runtime.preloadMonsterPacksForAct(1)
    expect(prefetched).toContain('sfx-mon-global')
    expect(prefetched.some((p) => p.startsWith('sfx-mon-act1'))).toBe(true)
  })

  it('skips monster death vocal on STATE_FREEZE (43) and drops unshipped monster sound IDs (1595..1598)', () => {
    const world = new ClientWorld()
    world.apply({
      type: 'UnitAssign',
      unit: { unitType: 1, id: 801, classId: 19, x: 5100, y: 5100, mode: 1, lifePct: 128 },
    })
    world.drainWorldSoundRequests()

    world.pushSoundRequest({ soundId: 1595 })
    expect(world.drainWorldSoundRequests()).toHaveLength(0)

    const frozenUnit = world.getUnit('monster', 801)!
    frozenUnit.states.add(43)
    world.apply({
      type: 'UnitMode',
      unitType: 1,
      id: 801,
      mode: 0,
      lifePct: 0,
    })
    expect(world.drainWorldSoundRequests().some((r) => r.soundId === 900)).toBe(false)
  })
})
