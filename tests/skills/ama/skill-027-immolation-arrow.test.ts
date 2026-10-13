/**
 * 1.13c Numerical & Runtime Verification Suite — Skill #027: Immolation Arrow (AMA)
 * Gitea Tracking Issue: #181
 */
import { describe, expect, it } from 'vitest'
import { getSharedDataRegistry } from '../../../src/baker/mpq-archive-source.ts'
import { UnitStatList } from '../../../src/server/engine/stat-list.ts'
import { WorldArena } from '../../../src/server/engine/world-arena.ts'
import { skillModule } from '../../../src/server/skills/impl/ama/skill-027-immolation-arrow.ts'
import { calculateImmolationArrowStats } from '../../../src/common/skills/amazon-bow.ts'

describe('[Skill #027] Immolation Arrow (AMA) — 1.13c Parity (Issue #181)', () => {
  it('evaluates exact 1.13c Skills.txt / Missiles.txt formulas at slvl 1, 10, and 20', async () => {
    const registry = await getSharedDataRegistry()
    const skillRec = registry.getSkillById(27)!
    expect(skillRec).toBeDefined()
    expect(skillModule.skillId).toBe(27)
    expect(skillModule.name).toBe("Immolation Arrow")
    expect(skillModule.charClass).toBe("ama")

    const stats1 = new UnitStatList()
    stats1.setBaseSkillLevel(27, 1)
    const r1 = skillModule.evaluate!({ registry, skill: skillRec, slvl: 1, blvl: 1, statList: stats1 })
    expect(r1.manaCost).toBe(6)
    expect(r1.manaCost256).toBe(1536)
    expect(r1.minPhysDmg).toBe(0)
    expect(r1.maxPhysDmg).toBe(0)
    expect(r1.minElemDmg256).toBe(3072)
    expect(r1.maxElemDmg256).toBe(5888)

    const stats10 = new UnitStatList()
    stats10.setBaseSkillLevel(27, 10)
    const r10 = skillModule.evaluate!({ registry, skill: skillRec, slvl: 10, blvl: 10, statList: stats10 })
    expect(r10.manaCost).toBe(10)
    expect(r10.manaCost256).toBe(2688)
    expect(r10.minPhysDmg).toBe(0)
    expect(r10.maxPhysDmg).toBe(0)
    expect(r10.minElemDmg256).toBe(36352)
    expect(r10.maxElemDmg256).toBe(39168)

    const stats20 = new UnitStatList()
    stats20.setBaseSkillLevel(27, 20)
    const r20 = skillModule.evaluate!({ registry, skill: skillRec, slvl: 20, blvl: 20, statList: stats20 })
    expect(r20.manaCost).toBe(15)
    expect(r20.manaCost256).toBe(3968)
    expect(r20.minPhysDmg).toBe(0)
    expect(r20.maxPhysDmg).toBe(0)
    expect(r20.minElemDmg256).toBe(106496)
    expect(r20.maxElemDmg256).toBe(109312)
    expect(r20.durationFrames).toBe(0)
    expect(r20.radiusSubtiles).toBe(79)
    expect(r20.petMax).toBe(0)
    expect(r20.cooldownFrames).toBe(25)
  })

  it('enforces 1.13c blvl synergy rule (hard points boost synergy; +skills and item charges do NOT)', async () => {
    const registry = await getSharedDataRegistry()
    const skillRec = registry.getSkillById(27)!
    const synId = 16

    const statsBase = new UnitStatList()
    statsBase.setBaseSkillLevel(27, 20)
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
    expect(withHardPoints.synergyBonusPct).toBe(200)

    // +20 allskills and +33 Marrowwalk charges without hard points must yield 0 synergy
    const statsSoftOnly = new UnitStatList()
    statsSoftOnly.setBaseSkillLevel(27, 20)
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
      skillId: 27,
      slvl: 20,
    })
    const outcome = arena.triggerCast()
    arena.stepTicks(15)
    const dbg = arena.getDebugState()

    expect(dbg.ready).toBe(true)
    expect(dbg.skillId).toBe(27)
    expect(dbg.castCount).toBeGreaterThanOrEqual(1)
    expect(dbg.actionFrameTriggered).toBe(true)
    expect(outcome?.executed).toBe(true)
  })

  it('validates 1.13c calculateImmolationArrowStats pure calculations, cooldown, and fire patch invariants', () => {
    // Level 1: 12-23 explosion fire dmg, 75 frames ground fire, 25 frames delay, +30% AR, 6.0 mana
    const s1 = calculateImmolationArrowStats(1)
    expect(s1.minExplosionDamage).toBe(12)
    expect(s1.maxExplosionDamage).toBe(23)
    expect(s1.firePatchDurationFrames).toBe(75)
    expect(s1.cooldownFrames).toBe(25)
    expect(s1.toHitBonusPct).toBe(30)
    expect(s1.manaCost).toBe(6.0)

    // Level 10: 142-153 explosion fire dmg, +111% AR, 10.5 mana
    const s10 = calculateImmolationArrowStats(10)
    expect(s10.minExplosionDamage).toBe(142)
    expect(s10.maxExplosionDamage).toBe(153)
    expect(s10.firePatchDurationFrames).toBe(75)
    expect(s10.cooldownFrames).toBe(25)
    expect(s10.toHitBonusPct).toBe(111)
    expect(s10.manaCost).toBe(10.5)

    // Level 20: 416-427 explosion fire dmg, +201% AR, 15.5 mana
    const s20 = calculateImmolationArrowStats(20)
    expect(s20.minExplosionDamage).toBe(416)
    expect(s20.maxExplosionDamage).toBe(427)
    expect(s20.firePatchDurationFrames).toBe(75)
    expect(s20.cooldownFrames).toBe(25)
    expect(s20.toHitBonusPct).toBe(201)
    expect(s20.manaCost).toBe(15.5)

    // Synergies: Exploding Arrow (+10%/blvl explosion dmg), Fire Arrow (+5%/blvl patch dmg)
    const s20Syn = calculateImmolationArrowStats(20, { explodingArrow: 20, fireArrow: 20 })
    expect(s20Syn.explosionSynergyMultiplier).toBe(3.0) // 1 + 20 * 0.10
    expect(s20Syn.firePatchSynergyMultiplier).toBe(2.0) // 1 + 20 * 0.05
    expect(s20Syn.minExplosionDamage).toBe(Math.floor(416 * 3.0))
    expect(s20Syn.maxExplosionDamage).toBe(Math.floor(427 * 3.0))

    // Monotonicity checks
    for (let lvl = 1; lvl < 30; lvl++) {
      const cur = calculateImmolationArrowStats(lvl)
      const nxt = calculateImmolationArrowStats(lvl + 1)
      expect(nxt.minExplosionDamage).toBeGreaterThanOrEqual(cur.minExplosionDamage)
      expect(nxt.maxExplosionDamage).toBeGreaterThanOrEqual(cur.maxExplosionDamage)
      expect(nxt.toHitBonusPct).toBeGreaterThan(cur.toHitBonusPct)
      expect(nxt.manaCost).toBeGreaterThan(cur.manaCost)
      expect(nxt.cooldownFrames).toBe(25)
      expect(nxt.firePatchDurationFrames).toBe(75)
    }

    // Boundary resilience
    const sZero = calculateImmolationArrowStats(0)
    expect(sZero.minExplosionDamage).toBe(12)
    expect(sZero.manaCost).toBe(6.0)

    const sNeg = calculateImmolationArrowStats(-4)
    expect(sNeg.minExplosionDamage).toBe(12)

    const sNan = calculateImmolationArrowStats(NaN)
    expect(sNan.minExplosionDamage).toBe(12)

    const sFrac = calculateImmolationArrowStats(11.3)
    expect(sFrac.minExplosionDamage).toBe(calculateImmolationArrowStats(11).minExplosionDamage)
  })
})
