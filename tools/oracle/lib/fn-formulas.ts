/**
 * Shared TS side of the function-level oracle (P5.3): maps every oracle
 * function id used by `tools/oracle/fn-sweep.ts` and the committed goldens
 * (`tests/fixtures/oracle/formulas/*.ndjson`) to the TS implementation it is
 * compared against. Oracle-side calling conventions:
 * `kb/engine/oracle-fn-harness-113c.md`.
 */
import { evaluateCalc, compute5BandScaling, computeDiminishingReturnsRaw, type CalcEvalContext } from '../../../src/common/data/calc-ast.ts'
import type { D2DataRegistry, SkillRecord } from '../../../src/common/data/data-registry.ts'
import {
  computeBlockRate113c,
  computeEffectiveResistance,
  computeLifeManaSteal113c,
  computeToHitChance,
  defenderResistParams113c,
  executeSUnitDmg,
  mulDiv113c,
  type CombatUnitContext,
  type ResistChannel113c,
} from '../../../src/server/engine/combat-pipeline.ts'
import { CHARACTER_CLASS_CODES, calculateVitalsAtLevel, resolveCharacterClass } from '../../../src/common/units/classes.ts'
import {
  computeDiminishingRate113c,
  computeEffectiveAnimRate113c,
  computeLocomotionStepSpeed256,
  computeMoveVelocityPercent113c,
  computeOneShotTicks,
  computeStepSpeed256,
  getCharAnimClip113c,
  resolvePlayerLocomotionBaseSpeed256,
  resolveWeaponWsm,
} from '../../../src/common/units/char-anim-speed.ts'
import { StateBus } from '../../../src/server/engine/state-bus.ts'
import { D2Rng } from '../../../src/common/rng/d2-rng.ts'
import { applyExpRatio113c, computeMonsterExpGrant113c } from '../../../src/common/progression/experience-113c.ts'
import { difficultyLifeStealDivisor, difficultyManaStealDivisor, difficultyResistPenalty } from '../../../src/server/engine/difficulty-resist-penalty.ts'
import { playerSkillsTargetAndMeleeMethods } from '../../../src/server/engine/game-instance/player-skills-target-and-melee.ts'
import { fogMulDiv113c } from '../../../src/common/items/transaction-cost.ts'
import { evaluateSkill113c } from '../../../src/server/skills/registry.ts'
import { UnitStatList } from '../../../src/server/engine/stat-list.ts'

/** `SkillCalc.txt` row order = D2Common SkillCalc callback code (`#10147`, table `0x6FDA174C`). */
export const SKILLCALC_CODES: readonly string[] = (
  'ln12 dm12 ln34 dm34 ln56 dm56 ln78 dm78 par1 par2 par3 par4 par5 par6 par7 par8 lvl edmn edmx edln ' +
  'toht mana mps math madm macr m1en m1ex m1el m2en m2ex m2el m3en m3ex m3el m1rn m2rn m3rn edns edxs ' +
  'ulvl blvl usmc m1eo m1ey m2eo m2ey me3o me3y enma exma edma enms exms len clc1 clc2 clc3 clc4 rng ' +
  'ast1 ast2 ast3 ast4 ast5 ast6 pst1 pst2 pst3 pst4 pst5 pets skpt'
).split(' ')

/** Skills.txt record offsets that hold a calc-buffer index (D2Common, record stride 0x23C). */
export const SKILL_CALC_FIELDS: readonly { readonly off: number; readonly name: string }[] = [
  { off: 0x60, name: 'auralencalc' },
  { off: 0x64, name: 'aurarangecalc' },
  { off: 0x68, name: 'aurastatcalc1' },
  { off: 0x6c, name: 'aurastatcalc2' },
  { off: 0x70, name: 'aurastatcalc3' },
  { off: 0x74, name: 'aurastatcalc4' },
  { off: 0x78, name: 'aurastatcalc5' },
  { off: 0x7c, name: 'aurastatcalc6' },
  { off: 0xa4, name: 'passivecalc1' },
  { off: 0xa8, name: 'passivecalc2' },
  { off: 0xac, name: 'passivecalc3' },
  { off: 0xb0, name: 'passivecalc4' },
  { off: 0xb4, name: 'passivecalc5' },
  { off: 0xc0, name: 'petmax' },
  { off: 0x138, name: 'calc1' },
  { off: 0x13c, name: 'calc2' },
  { off: 0x140, name: 'calc3' },
  { off: 0x144, name: 'calc4' },
  { off: 0x170, name: 'skpoints' },
  { off: 0x1a0, name: 'ToHitCalc' },
  { off: 0x1d8, name: 'DmgSymPerCalc' },
  { off: 0x210, name: 'EDmgSymPerCalc' },
  { off: 0x224, name: 'ELenSymPerCalc' },
]

export function skillCalcFieldName(off: number): string {
  return SKILL_CALC_FIELDS.find(f => f.off === off)?.name ?? `0x${off.toString(16)}`
}

/** Raw calc-column text of a skill (column names as in Skills.txt). */
export function skillCalcText(reg: D2DataRegistry, skill: SkillRecord, off: number): string {
  switch (off) {
    case 0x60: return skill.auraLenCalc
    case 0x64: return skill.auraRangeCalc
    case 0x68: return skill.auraStatCalc1
    case 0x6c: return skill.auraStatCalc2
    case 0x70: return skill.auraStatCalc3
    case 0x74: return skill.auraStatCalc4
    case 0x78: return skill.auraStatCalc5
    case 0x7c: return skill.auraStatCalc6
    case 0xa4: return skill.passiveCalc1
    case 0xa8: return skill.passiveCalc2
    case 0xac: return skill.passiveCalc3
    case 0xb0: return skill.passiveCalc4
    case 0xb4: return skill.passiveCalc5
    case 0xc0: return skill.petMax
    case 0x138: return skill.calc1
    case 0x13c: return skill.calc2
    case 0x140: return skill.calc3
    case 0x144: return skill.calc4
    case 0x170: return skillsRow(reg, skill.id)?.['skpoints'] ?? ''
    case 0x1a0: return skill.toHitCalc
    case 0x1d8: return skill.dmgSymPerCalc
    case 0x210: return skill.eDmgSymPerCalc
    case 0x224: return skill.eLenSymPerCalc
    default: return ''
  }
}

const rowCache = new WeakMap<D2DataRegistry, Map<number, Readonly<Record<string, string>>>>()
function skillsRow(reg: D2DataRegistry, id: number): Readonly<Record<string, string>> | undefined {
  let m = rowCache.get(reg)
  if (!m) {
    m = new Map()
    for (const row of reg.skillsTable.rows) {
      const n = Number(row['Id'] ?? row['ID'] ?? row['id'])
      if (Number.isInteger(n)) m.set(n, row)
    }
    rowCache.set(reg, m)
  }
  return m.get(id)
}

/** Skill ids referenced by `skill('Name'.x)` / `sklvl('Name'.x.y)` in any calc column of `skill`. */
export function referencedSkills(reg: D2DataRegistry, skill: SkillRecord): number[] {
  const ids = new Set<number>()
  for (const f of SKILL_CALC_FIELDS) {
    const t = skillCalcText(reg, skill, f.off)
    for (const m of t.matchAll(/(?:skill|sklvl)\s*\(\s*'([^']+)'/gi)) {
      const s = reg.getSkillByName(m[1] ?? '')
      if (s && s.id !== skill.id) ids.add(s.id)
    }
  }
  return [...ids].sort((a, b) => a - b)
}

/**
 * Unit environment of one oracle call: native skill hard levels on the player
 * (`pSkill+0x28`, written by the harness `SETSKILL`) and the player's accrued stats
 * (`#10973`, layer 0) as observed by the oracle.
 */
export interface SkillEnv {
  readonly hard: ReadonlyMap<number, number>
  readonly stats: ReadonlyMap<number, number>
}

function statId(reg: D2DataRegistry, nameOrId: string | number): number {
  if (typeof nameOrId === 'number') return nameOrId
  const n = Number(nameOrId)
  if (Number.isInteger(n) && nameOrId.trim() !== '') return n
  return reg.getStatByName(nameOrId)?.id ?? -1
}

export function skillCalcCtx(reg: D2DataRegistry, skill: SkillRecord, lvl: number, env: SkillEnv): CalcEvalContext {
  const hardOf = (id: number): number => env.hard.get(id) ?? 0
  return {
    registry: reg,
    activeSkill: skill,
    slvl: lvl,
    blvl: hardOf(skill.id),
    ulvl: env.stats.get(12) ?? 0,
    getBaseSkillLevel: hardOf,
    getEffectiveSkillLevel: (id: number) => Math.min(99, Math.max(0, hardOf(id))),
    getUnitStat: (s: string | number) => env.stats.get(statId(reg, s)) ?? 0,
  }
}

/** Oracle function ids of the `skills` category and their TS counterparts. */
export type SkillFn = 'skcalc' | 'skform' | 'elmin' | 'elmax' | 'elen' | 'phmin' | 'phmax' | 'tohit' | 'rawmana'

/** Lazily-built per-line state shared by every level of one golden line. */
export interface SkillLineCache {
  statList?: UnitStatList
}

export function tsSkillFn(
  reg: D2DataRegistry,
  fn: SkillFn,
  skillId: number,
  lvl: number,
  x: number,
  env: SkillEnv,
  cache: SkillLineCache = {},
): number {
  const skill = reg.getSkillById(skillId)
  if (!skill) return 0
  const ctx = skillCalcCtx(reg, skill, lvl, env)
  switch (fn) {
    case 'skcalc':
      return evaluateCalc(SKILLCALC_CODES[x] ?? '', ctx)
    case 'skform':
      return evaluateCalc(skillCalcText(reg, skill, x), ctx)
    case 'elmin':
      return evaluateCalc(x ? 'enms' : 'edns', ctx)
    case 'elmax':
      return evaluateCalc(x ? 'exms' : 'edxs', ctx)
    case 'elen':
      return evaluateCalc('edln', ctx)
    case 'tohit':
      return evaluateCalc('toht', ctx)
    case 'phmin':
      return tsSkillEvalFn(reg, 'eval.minPhysDmg', skillId, lvl, env, cache)
    case 'phmax':
      return tsSkillEvalFn(reg, 'eval.maxPhysDmg', skillId, lvl, env, cache)
    case 'rawmana':
      return tsSkillEvalFn(reg, 'eval.rawManaCost256', skillId, lvl, env, cache)
  }
}

/** A `UnitStatList` mirroring the oracle unit environment (player stats + native hard levels). */
export function envStatList(reg: D2DataRegistry, env: SkillEnv): UnitStatList {
  const sl = new UnitStatList(reg, undefined, { ownerType: 'player', charClass: 'bar' })
  for (const [id, v] of env.stats) sl.setBaseStat(id, v)
  sl.replaceSkillLevels(new Map(env.hard), new Map())
  return sl
}

/** `evaluateSkill113c` result fields compared against single D2Common functions (`skilleval` category). */
export type SkillEvalFn = 'eval.minElemDmg256' | 'eval.maxElemDmg256' | 'eval.toHitBonusPct' | 'eval.rawManaCost256' | 'eval.minPhysDmg' | 'eval.maxPhysDmg'

export function tsSkillEvalFn(
  reg: D2DataRegistry,
  fn: SkillEvalFn,
  skillId: number,
  lvl: number,
  env: SkillEnv,
  cache: SkillLineCache = {},
): number {
  const skill = reg.getSkillById(skillId)
  if (!skill) return 0
  cache.statList ??= envStatList(reg, env)
  const r = evaluateSkill113c({ registry: reg, skill, slvl: lvl, blvl: env.hard.get(skill.id) ?? 0, statList: cache.statList })
  switch (fn) {
    case 'eval.minElemDmg256': return r.minElemDmg256
    case 'eval.maxElemDmg256': return r.maxElemDmg256
    case 'eval.toHitBonusPct': return r.toHitBonusPct
    case 'eval.rawManaCost256': return r.rawManaCost256 ?? 0
    // D2Common #10297 / #10567 return the flat skill damage << HitShift.
    case 'eval.minPhysDmg': return (r.minPhysDmg << skill.hitShift) | 0
    case 'eval.maxPhysDmg': return (r.maxPhysDmg << skill.hitShift) | 0
  }
}

/** Pure integer primitives. Inputs are the oracle argument order. */
export type PrimFn = 'muldiv' | 'muldiv.fog' | 'muldiv.game' | 'dimret' | 'band5'

export function tsPrimFn(fn: PrimFn, a: readonly number[]): number {
  switch (fn) {
    case 'muldiv': // oracle [edx, eax, ecx] -> D2Common 0x6FD511E0; TS mulDiv113c(eax, edx, ecx)
      return mulDiv113c(a[1] ?? 0, a[0] ?? 0, a[2] ?? 0)
    case 'muldiv.fog':
      return fogMulDiv113c(a[1] ?? 0, a[0] ?? 0, a[2] ?? 0)
    case 'muldiv.game': // D2Game 0x6FC214D0, same convention
      return mulDiv113c(a[1] ?? 0, a[0] ?? 0, a[2] ?? 0)
    case 'dimret': // oracle [lvl, a, b] -> #10115 0x6FD9DC30
      return computeDiminishingReturnsRaw(a[1] ?? 0, a[2] ?? 0, a[0] ?? 0)
    case 'band5': // oracle [lvl, l1..l5] -> 0x6FD9DDB0 (no base term)
      return compute5BandScaling(a[0] ?? 0, 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0, a[4] ?? 0, a[5] ?? 0)
  }
}

// ------------------------------------------------- stats / combat / progression
/** CharStats row order (= D2UnitStrc+0x04 class id). */
const CLASS_BY_ID = CHARACTER_CLASS_CODES

/** `ItemStatCost.txt` resist / max-resist / pierce stat per D2Game resist descriptor row (0x6FD22AB0). */
export const RESIST_ROWS: Readonly<Record<number, { channel: ResistChannel113c; res: number; max: number; pierce: number }>> = {
  0: { channel: 'phys', res: 36, max: -1, pierce: -1 },
  1: { channel: 'fire', res: 39, max: 40, pierce: 333 },
  2: { channel: 'ltng', res: 41, max: 42, pierce: 334 },
  3: { channel: 'cold', res: 43, max: 44, pierce: 335 },
  4: { channel: 'mag', res: 37, max: 38, pierce: -1 },
  8: { channel: 'pois', res: 45, max: 46, pierce: 336 },
}

/** D2Common 0x6FD823E0 rate table (0x6FDE4608): index -> stat id (base 120 for 0..3). */
export const DIMINISH_STATS: readonly number[] = [93, 99, 105, 102]

export type CombatFn =
  | 'ar' | 'def' | 'block' | 'vit.maxhp' | 'vit.maxstamina' | 'ene.maxmana'
  | 'levelup.maxhp' | 'levelup.maxmana' | 'levelup.maxstamina' | 'levelup.statpts' | 'levelup.newskills'
  | 'hit' | 'resist' | 'steal.life' | 'steal.mana' | 'diminish' | 'explvl' | 'expratio'

function vitalsDelta256(cls: number, levels: number, vit: number, ene: number, which: 'life' | 'mana' | 'stamina'): number {
  const cs = resolveCharacterClass(CLASS_BY_ID[cls] ?? 'ama')
  const base = calculateVitalsAtLevel(cs, 1)
  const now = calculateVitalsAtLevel(cs, 1 + levels, { vitality: vit, energy: ene })
  return Math.round((now[which] - base[which]) * 256)
}

/**
 * TS value for one combat/progression oracle case. Argument layouts (oracle-observed accrued values):
 * - ar [class, dex, tohit]; def [dex, armorclass, skill_armor_percent, item_armor_percent, armor_override_percent]
 * - block [class, bExpansion, dex, level, toblock]
 * - vit.* / ene.* [class, points]; levelup.* [class, levelsGained]
 * - hit [ar, def, alvl, dlvl, extraPct, itemPct, bMissile, acVsHthOrMissile]
 * - resist [row, defenderIsPlayer, res, maxStat, pierce, penalty]
 * - steal.* [phys256, lifePct, manaPct, difficulty, drain]; diminish [index, value]
 * - explvl [clvl, mlvl, exp]; expratio [exp, clvl]
 */
export function tsCombatFn(reg: D2DataRegistry, fn: CombatFn, a: readonly number[]): number {
  const n = (i: number): number => a[i] ?? 0
  switch (fn) {
    case 'ar': {
      const host = { sumPlayerItemStat: (_p: unknown, id: number) => (id === 19 ? n(2) : 0) }
      const player = { classCode: CLASS_BY_ID[n(0)] ?? 'ama', dexterity: n(1) }
      const f = playerSkillsTargetAndMeleeMethods.computePlayerBaseToHit113c as (this: unknown, p: unknown) => number
      return f.call(host, player)
    }
    case 'def': {
      const sl = new UnitStatList(reg, undefined, { ownerType: 'player', charClass: 'bar' })
      sl.setBaseStat(2, n(0))
      sl.setBaseStat(31, n(1))
      sl.setBaseStat(171, n(2))
      sl.setBaseStat(16, n(3))
      sl.setBaseStat(182, n(4))
      return sl.getDefense()
    }
    case 'block': {
      const sl = new UnitStatList(reg, undefined, { ownerType: 'player', charClass: CLASS_BY_ID[n(0)] ?? 'ama' })
      sl.setBaseStat(2, n(2))
      sl.setBaseStat(12, n(3))
      sl.setBaseStat(20, n(4))
      const unit = { id: 'p', name: 'p', unitType: 'player', hasShield: true, charClass: CLASS_BY_ID[n(0)], statList: sl }
      return computeBlockRate113c(unit as unknown as CombatUnitContext, n(1) !== 0)
    }
    case 'vit.maxhp': return vitalsDelta256(n(0), 0, n(1), 0, 'life')
    case 'vit.maxstamina': return vitalsDelta256(n(0), 0, n(1), 0, 'stamina')
    case 'ene.maxmana': return vitalsDelta256(n(0), 0, 0, n(1), 'mana')
    case 'levelup.maxhp': return vitalsDelta256(n(0), n(1), 0, 0, 'life')
    case 'levelup.maxmana': return vitalsDelta256(n(0), n(1), 0, 0, 'mana')
    case 'levelup.maxstamina': return vitalsDelta256(n(0), n(1), 0, 0, 'stamina')
    case 'levelup.statpts': return resolveCharacterClass(CLASS_BY_ID[n(0)] ?? 'ama').perLevel.statPoints * n(1)
    case 'levelup.newskills': return n(1)
    case 'hit':
      return computeToHitChance({
        attackerAr: n(0),
        defenderDef: n(1),
        attackerLvl: n(2),
        defenderLvl: n(3),
        skillArBonusPct: n(4),
        itemArBonusPct: n(5),
        attackKind: n(6) ? 'missile' : 'melee',
        ...(n(6) ? { defenderAcVsMissile: n(7) } : { defenderAcVsHth: n(7) }),
      })
    case 'resist': {
      const row = RESIST_ROWS[n(0)]
      if (!row) return 0
      if (n(1)) {
        const sl = new UnitStatList(reg, undefined, { ownerType: 'player', charClass: 'bar' })
        if (row.max >= 0) sl.setBaseStat(row.max, n(3))
        const params = defenderResistParams113c({ unitType: 'player', statList: sl, resistPenalty: n(5) }, row.channel)
        return computeEffectiveResistance({ baseRes: n(2), passiveEnemyPierce: n(4), ...params }).effectiveRes
      }
      return computeEffectiveResistance({ baseRes: n(2), passiveEnemyPierce: n(4), isDefenderPlayer: false }).effectiveRes
    }
    case 'steal.life':
    case 'steal.mana': {
      const r = computeLifeManaSteal113c({
        phys256: n(0),
        lifeStealPct: n(1),
        manaStealPct: n(2),
        attackerIsPlayer: true,
        lifeStealDivisor: difficultyLifeStealDivisor(n(3)),
        manaStealDivisor: difficultyManaStealDivisor(n(3)),
        defenderIsMonster: true,
        defenderDrain: n(4),
      })
      return fn === 'steal.life' ? r.life256 : r.mana256
    }
    case 'diminish': return computeDiminishingRate113c(n(1))
    case 'explvl': return computeMonsterExpGrant113c(n(2), n(0), n(1))
    case 'expratio': return applyExpRatio113c(n(0), n(1))
  }
}

// ------------------------------------------------- damage pipeline (0x6FCFC0B0)
/** Elemental channels exercised: index -> D2DamageStrc offset + stat ids + TS elemType. */
export const DMG_CHANNELS: readonly {
  readonly off: number
  readonly elemType: string
  readonly res: number
  readonly max: number
  readonly absPct: number
  readonly absFlat: number
  readonly pierce: number
}[] = [
  { off: 0x10, elemType: 'fire', res: 39, max: 40, absPct: 142, absFlat: 143, pierce: 333 },
  { off: 0x1c, elemType: 'ltng', res: 41, max: 42, absPct: 144, absFlat: 145, pierce: 334 },
  { off: 0x24, elemType: 'cold', res: 43, max: 44, absPct: 148, absFlat: 149, pierce: 335 },
  { off: 0x20, elemType: 'mag', res: 37, max: 38, absPct: 146, absFlat: 147, pierce: -1 },
]

export type DmgFn = 'dmg.phys' | 'dmg.elem' | 'dmg.total' | 'dmg.absorb'

function combatUnit(reg: D2DataRegistry, unitType: 'player' | 'monster', stats: readonly (readonly [number, number])[]): CombatUnitContext {
  const sl = new UnitStatList(reg, undefined, { ownerType: unitType === 'player' ? 'player' : 'monster', charClass: 'bar' })
  sl.setBaseStat(12, 1)
  sl.setBaseStat(7, 0x3fffff00)
  sl.setHp256(0x3fffff00)
  for (const [id, v] of stats) sl.setBaseStat(id, v)
  return { id: unitType, name: unitType, unitType, statList: sl, stateBus: new StateBus(sl) } as unknown as CombatUnitContext
}

/**
 * TS value of one damage-pipeline case through `executeSUnitDmg` (spell, auto-hit, fixed ranges).
 * a = [defIsPlayer, difficulty, phys256, channel, elem256, rate54, dr, mdr, physRes, res, maxRes, absPct, absFlat, pierce]
 */
export function tsDmgFn(reg: D2DataRegistry, fn: DmgFn, a: readonly number[]): number {
  const n = (i: number): number => a[i] ?? 0
  const ch = DMG_CHANNELS[n(3)] ?? DMG_CHANNELS[0]!
  const defStats: [number, number][] = [[34, n(6)], [35, n(7)], [36, n(8)], [ch.res, n(9)], [ch.max, n(10)], [ch.absPct, n(11)], [ch.absFlat, n(12)]]
  const defender = combatUnit(reg, n(0) ? 'player' : 'monster', defStats)
  // The caller supplies the DifficultyLevels.txt ResistPenalty for player defenders (defenderResistParams113c).
  if (n(0)) (defender as { resistPenalty?: number }).resistPenalty = difficultyResistPenalty(n(1))
  const attacker = combatUnit(reg, n(0) ? 'monster' : 'player', ch.pierce >= 0 ? [[ch.pierce, n(13)]] : [])
  const out = executeSUnitDmg(
    attacker,
    defender,
    {
      skillId: 0,
      attackKind: 'spell',
      srcDam: 0,
      flatPhysMin256: n(2),
      flatPhysMax256: n(2),
      elemType: ch.elemType,
      elemMin256: n(4),
      elemMax256: n(4),
      autoHit: true,
      unblockable: true,
      unavoidable: true,
      difficulty: n(1) as 0 | 1 | 2,
      isExpansion: true,
      noHitRecovery: true,
      ...(n(5) > 0 ? { frameRate1024: n(5) } : {}),
    },
    new D2Rng(1),
  )
  switch (fn) {
    case 'dmg.phys': return out.physDamage256
    case 'dmg.elem': return out.elemDamage256
    case 'dmg.total': return out.totalDamage256
    case 'dmg.absorb': return out.absorbHeal256 ?? 0
  }
}

// ------------------------------------------------- animation (D2Common #10819 / #10385)
export const PLR_MODE_CODES: readonly string[] = ['DT', 'NU', 'WL', 'RN', 'GH', 'TN', 'TW', 'A1', 'A2', 'BL', 'SC', 'TH', 'KK', 'S1', 'S2', 'S3', 'S4', 'DD', 'SQ', 'KB']
export const PLR_TOKENS: readonly string[] = ['AM', 'SO', 'NE', 'PA', 'BA', 'DZ', 'AI']
export const WCLASS_CODES: readonly string[] = ['HTH', 'BOW', '1HS', '1HT', 'STF', '2HS', '2HT', 'XBW', '1JS', '1JT', '1SS', '1ST', 'HT1', 'HT2']
/** Rate stat per tested mode (cast / gethit / block / attack / run / walk). */
export const ANIM_MODE_STAT: Readonly<Record<number, number>> = { 10: 105, 4: 99, 9: 102, 7: 93, 3: 96, 2: 96 }

export type AnimFn = 'animdata.frames' | 'animdata.speed' | 'animdata.action' | 'anim.speed' | 'anim.ticks'

/**
 * - animdata.* a = [classId, mode, wclassIdx] (only records #10385 finds)
 * - anim.speed / anim.ticks a = [mode, classId, statAcc, stat68Acc, stat67Acc, recFrames]
 *   (the player wields a Hand Axe: weapon class 1HS, WSM 0). Attack: the original rate is
 *   `stat68 + dIAS` (kb combat/d2game-tohit-defense §7); the sweep sets stat 68 = 100 + skill IAS, which is
 *   the TS `skillIas` (TS assumes the 100 base).
 */
export function tsAnimFn(fn: AnimFn, a: readonly number[]): number {
  const n = (i: number): number => a[i] ?? 0
  if (fn.startsWith('animdata.')) {
    const clip = getCharAnimClip113c(n(0), n(1), { weaponClass: (WCLASS_CODES[n(2)] ?? 'hth').toLowerCase() })
    return fn === 'animdata.frames' ? clip.frames : fn === 'animdata.speed' ? clip.speed : clip.actionFrame
  }
  const mode = n(0)
  const clip = getCharAnimClip113c(n(1), mode, { weaponClass: '1hs' })
  let speed: number
  if (mode === 2 || mode === 3) {
    const base = resolvePlayerLocomotionBaseSpeed256(mode === 3 ? 'rn' : 'wl', clip.speed)
    speed = computeLocomotionStepSpeed256(base, computeMoveVelocityPercent113c({ stat67: n(4), itemFrw: n(2), running: mode === 3 }))
  } else {
    const stats =
      mode === 10 ? { fcr: n(2) } : mode === 4 ? { fhr: n(2) } : mode === 9 ? { fbr: n(2) } : { itemIas: n(2), skillIas: n(3) - 100, weaponWsm: resolveWeaponWsm('hax') }
    speed = computeStepSpeed256(clip.speed, computeEffectiveAnimRate113c(mode, stats))
  }
  return fn === 'anim.speed' ? speed : computeOneShotTicks(clip.frames, speed)
}
