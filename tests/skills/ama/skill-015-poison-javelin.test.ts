/**
 * 1.13c Numerical & Runtime Verification Suite — Skill #015: Poison Javelin (AMA)
 * Gitea Tracking Issue: #169
 */
import { describe, expect, it } from 'vitest'
import { getSharedDataRegistry } from '../../../src/baker/mpq-archive-source.ts'
import { calculatePoisonJavelinStats } from '../../../src/common/skills/amazon-javelin-spear.ts'
import { getSkillCooldownTicks } from '../../../src/common/skills/missiles-data.ts'
import { UnitStatList } from '../../../src/server/engine/stat-list.ts'
import { WorldArena } from '../../../src/server/engine/world-arena.ts'
import { skillModule } from '../../../src/server/skills/impl/ama/skill-015-poison-javelin.ts'

describe('[Skill #015] Poison Javelin (AMA) — 1.13c Parity (Issue #169 / #972)', () => {
  it('computes pure calculatePoisonJavelinStats 1.13c formulas (200+50*(slvl-1) frames, 15-frame delay, HitShift=5 poison)', () => {
    expect(getSkillCooldownTicks(15)).toBe(15)

    const p1 = calculatePoisonJavelinStats(1)
    expect(p1.durationFrames).toBe(200)
    expect(p1.castingDelayFrames).toBe(15)
    expect(p1.hitShift).toBe(5)
    expect(p1.manaCost).toBe(4)

    const p20 = calculatePoisonJavelinStats(20)
    expect(p20.durationFrames).toBe(1150)
    expect(p20.castingDelayFrames).toBe(15)
    expect(p20.manaCost).toBe(8.75)
  })

  it('evaluates exact 1.13c Skills.txt / Missiles.txt formulas at slvl 1, 10, and 20', async () => {
    const registry = await getSharedDataRegistry()
    const skillRec = registry.getSkillById(15)!
    expect(skillRec).toBeDefined()
    expect(skillModule.skillId).toBe(15)
    expect(skillModule.name).toBe("Poison Javelin")
    expect(skillModule.charClass).toBe("ama")

    const stats1 = new UnitStatList()
    stats1.setBaseSkillLevel(15, 1)
    const r1 = skillModule.evaluate!({ registry, skill: skillRec, slvl: 1, blvl: 1, statList: stats1 })
    expect(r1.manaCost).toBe(4)
    expect(r1.manaCost256).toBe(1024)
    expect(r1.minPhysDmg).toBe(0)
    expect(r1.maxPhysDmg).toBe(0)
    expect(r1.minElemDmg256).toBe(8192)
    expect(r1.maxElemDmg256).toBe(12288)

    const stats10 = new UnitStatList()
    stats10.setBaseSkillLevel(15, 10)
    const r10 = skillModule.evaluate!({ registry, skill: skillRec, slvl: 10, blvl: 10, statList: stats10 })
    expect(r10.manaCost).toBe(6)
    expect(r10.manaCost256).toBe(1600)
    expect(r10.minPhysDmg).toBe(0)
    expect(r10.maxPhysDmg).toBe(0)
    expect(r10.minElemDmg256).toBe(53248)
    expect(r10.maxElemDmg256).toBe(59392)

    const stats20 = new UnitStatList()
    stats20.setBaseSkillLevel(15, 20)
    const r20 = skillModule.evaluate!({ registry, skill: skillRec, slvl: 20, blvl: 20, statList: stats20 })
    expect(r20.manaCost).toBe(8)
    expect(r20.manaCost256).toBe(2240)
    expect(r20.minPhysDmg).toBe(0)
    expect(r20.maxPhysDmg).toBe(0)
    expect(r20.minElemDmg256).toBe(151552)
    expect(r20.maxElemDmg256).toBe(167936)
    expect(r20.durationFrames).toBe(1150)
    expect(r20.radiusSubtiles).toBe(0)
    expect(r20.petMax).toBe(0)
    expect(r20.cooldownFrames).toBe(15)
  })

  it('enforces 1.13c blvl synergy rule (hard points boost synergy; +skills and item charges do NOT)', async () => {
    const registry = await getSharedDataRegistry()
    const skillRec = registry.getSkillById(15)!
    const synId = 25

    const statsBase = new UnitStatList()
    statsBase.setBaseSkillLevel(15, 20)
    if (synId !== null) {
      statsBase.setBaseSkillLevel(synId, 20)
    }
    const withHardPoints = skillModule.evaluate!({
      registry,
      skill: skillRec,
      slvl: 20,
      blvl: 20,
      statList: statsBase,
    })
    expect(withHardPoints.synergyBonusPct).toBe(240)

    // +20 allskills and +33 Marrowwalk charges without hard points must yield 0 synergy
    const statsSoftOnly = new UnitStatList()
    statsSoftOnly.setBaseSkillLevel(15, 20)
    statsSoftOnly.addStat('item_allskills', 20)
    if (synId !== null) {
      statsSoftOnly.setChargedSkillLevel(synId, 33)
    }
    const withSoftOnly = skillModule.evaluate!({
      registry,
      skill: skillRec,
      slvl: 20,
      blvl: 20,
      statList: statsSoftOnly,
    })
    expect(withSoftOnly.synergyBonusPct).toBe(0)
  })

  it('executes runtime skill effect in WorldArena (castCount, action frame, and combat/state/missile/summon outcome)', async () => {
    const registry = await getSharedDataRegistry()
    const arena = new WorldArena({
      registry,
      classCode: "ama",
      skillId: 15,
      slvl: 20,
    })
    const outcome = arena.triggerCast()
    arena.stepTicks(15)
    const dbg = arena.getDebugState()

    expect(dbg.ready).toBe(true)
    expect(dbg.skillId).toBe(15)
    expect(dbg.castCount).toBeGreaterThanOrEqual(1)
    expect(dbg.actionFrameTriggered).toBe(true)
    expect(outcome?.executed).toBe(true)
    expect(outcome?.missilesSpawned).toContain('poisonjav')
    expect(dbg.missilesActive.some(m => m.celFile.length > 0)).toBe(true)

    // Throwing javelin ammo consumption (decquant = 1)
    arena.player.weaponItemType = 'jave'
    arena.player.weaponQuantity = 0
    const noAmmo = arena.triggerCast()
    expect(noAmmo?.executed).toBe(false)
    expect(noAmmo?.error).toBe('no_ammo')
  })

  it('verifies ClientWorld Layer 4 (Issue #975): #15 Poison Javelin pierces and emits poisonjavcloud trail', async () => {
    const { ClientWorld } = await import('../../../src/client/world/client-world.ts')
    const world = new ClientWorld()
    world.apply({ type: 'PlayerAssign', unitId: 1, charClass: 0, name: 'Ama', x: 100, y: 100 })
    const caster = world.getUnit('player', 1)!
    ;(world as any).spawnMissilesForSkill(caster, 15, 115, 100, 10)
    const pjav = Array.from(world.units.values()).find(
      (u) => u.unitType === 'missile' && u.missileKey === 'poisonjav',
    )!
    expect(pjav).toBeDefined()
    expect(pjav.pierce).toBe(true)
    ;(world as any).stepMissileUnit(pjav)
    expect(
      Array.from(world.units.values()).some(
        (u) => u.unitType === 'missile' && u.missileKey === 'poisonjavcloud',
      ),
    ).toBe(true)
  })
})


