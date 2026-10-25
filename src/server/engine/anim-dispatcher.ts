/**
 * Diablo II: Lord of Destruction v1.13c `AnimData.d2` Frame Dispatcher (`AnimDispatcher`).
 *
 * Implements:
 * - 1.13c `EIAS` (`floor((120 * IAS) / (120 + IAS)) + skillIas - WSM`, clamped `[-85, 75]`)
 *   and `EFCR` (`floor((120 * FCR) / (120 + FCR))`, clamped `[-85, 75]`) diminishing returns.
 * - `AnimData.d2` 8.8 fixed-point frame advancement (`speed = (animSpeed * (100 + effRate)) / 100`).
 * - Action frame flag (`0x01` melee/cast release, `0x02` missile launch) dispatching.
 * - `STATE_SKILLDELAY` global cooldown enforcement (`delay` ticks from `Skills.txt`).
 * - Shapeshift / weapon `restrict` validation (`restrict=1` any form, `restrict=2` shapeshift only,
 *   `restrict=0` human form only except Armageddon `249`).
 * - Mana (`manaCost256`) and ammo quantity (`decquant`) deduction on the action frame.
 */
import type { D2DataRegistry, SkillRecord } from '../../common/data/data-registry.ts'
import type { AnimDataRecord } from '../../common/formats/animdata.ts'
import { evaluateCalc, computeSkillManaCost256 } from '../../common/data/calc-ast.ts'
import { resolveSkillSequenceFrame } from '../../common/skills/skill-anim-modes.ts'
import { computeShapeshiftWeaponDelay113c } from '../../common/units/char-anim-speed.ts'
import { UnitStatList } from './stat-list.ts'
import { StateBus } from './state-bus.ts'

/**
 * 1.13c Diminishing returns conversion for IAS (`EIAS`) and FCR (`EFCR`):
 * `floor((120 * rate) / (120 + rate))`
 */
export function computeDiminishingRate113c(statRate: number): number {
  if (statRate <= 0) return Math.max(-85, Math.trunc(statRate))
  return Math.trunc((120 * statRate) / (120 + statRate))
}

export function computeEffectiveIas(params: {
  itemIas: number
  skillIas?: number // e.g. Fanaticism / Burst of Speed / Frenzy / Werewolf
  weaponWsm?: number // e.g. -20 for Phase Blade, +10 for Maul
}): number {
  const eias = computeDiminishingRate113c(params.itemIas) + (params.skillIas ?? 0) - (params.weaponWsm ?? 0)
  return Math.max(-85, Math.min(75, Math.trunc(eias)))
}

export function computeEffectiveFcr(itemFcr: number): number {
  const efcr = computeDiminishingRate113c(itemFcr)
  return Math.max(-85, Math.min(75, Math.trunc(efcr)))
}

export interface ActiveAnimationState {
  readonly skill: SkillRecord
  readonly slvl: number
  readonly cofName: string
  readonly animRecord: AnimDataRecord
  readonly framesPerDirection: number
  readonly stepSpeed256: number
  readonly actionFrame: number
  readonly isSequence?: boolean
  readonly targetX: number
  readonly targetY: number
  readonly manaDeductedOnStart?: boolean
  frameAcc256: number
  currentFrame: number
  actionTriggered: boolean
  completed: boolean
}

export interface CastAttemptResult {
  readonly allowed: boolean
  readonly reason?: 'skill_delay' | 'insufficient_mana' | 'restrict_shapeshift' | 'restrict_human' | 'passive_skill'
  readonly animState?: ActiveAnimationState
}

export class AnimDispatcher {
  readonly registry: D2DataRegistry
  readonly statList: UnitStatList
  readonly stateBus: StateBus
  readonly charToken: string // 'am' | 'so' | 'ne' | 'pa' | 'bar'->'ba' | 'dz' | 'ai'
  private weaponClass: string // 'hth' | '1hs' | 'bow' | '1ht' | 'ht1' | 'ht2' | 'stf' ...
  private currentAnim: ActiveAnimationState | null = null
  private skillDelayExpireFrame = 0
  private ammoQuantity = 250

  constructor(params: {
    registry: D2DataRegistry
    statList: UnitStatList
    stateBus: StateBus
    charToken: string
    weaponClass?: string
  }) {
    this.registry = params.registry
    this.statList = params.statList
    this.stateBus = params.stateBus
    this.charToken = params.charToken.toUpperCase()
    const norm = (params.weaponClass ?? 'HTH').trim().toUpperCase()
    this.weaponClass = norm === 'H2H' ? 'HT1' : norm
  }

  getWeaponClass(): string {
    return this.weaponClass
  }

  setWeaponClass(wclass: string): void {
    const norm = (wclass || 'HTH').trim().toUpperCase()
    this.weaponClass = norm === 'H2H' ? 'HT1' : norm
  }

  isSkillDelayActive(currentTick: number): boolean {
    return this.skillDelayExpireFrame > currentTick || this.stateBus.hasState('skilldelay')
  }

  getRemainingSkillDelay(currentTick: number): number {
    return Math.max(0, this.skillDelayExpireFrame - currentTick)
  }

  getAmmoQuantity(): number {
    const statQty = this.statList.getAccruedStat('quantity')
    if (statQty > 0) {
      return statQty
    }
    return this.ammoQuantity
  }

  setAmmoQuantity(qty: number): void {
    const val = Math.max(0, Math.trunc(qty))
    this.ammoQuantity = val
    if (this.statList.getAccruedStat('quantity') > 0 || this.statList.getBaseStat('quantity') > 0) {
      this.statList.setBaseStat('quantity', val)
    }
  }

  /**
   * Validate shapeshift `restrict` rule from `Skills.txt`:
   * - `restrict = 0`: usable in human form only (except `Armageddon` 249 and `Werewolf` 223 / `Werebear` 228 unshift)
   * - `restrict = 1`: usable in both human and shapeshift forms
   * - `restrict = 2`: usable in shapeshift (`STATE_WOLF` / `STATE_BEAR`) form only!
   */
  validateRestriction(skill: SkillRecord): { ok: boolean; reason?: 'restrict_shapeshift' | 'restrict_human' } {
    const inWolf =
      this.stateBus.hasState('wolf') ||
      this.stateBus.hasState('wearwolf') ||
      this.stateBus.hasState(139)
    const inBear =
      this.stateBus.hasState('bear') ||
      this.stateBus.hasState('wearbear') ||
      this.stateBus.hasState(140)
    const inWolfOrBear = inWolf || inBear

    if (skill.restrict === 2) {
      if (!inWolfOrBear) {
        return { ok: false, reason: 'restrict_shapeshift' }
      }
      if ((skill.id === 232 || skill.id === 238 || skill.id === 248) && !inWolf) {
        return { ok: false, reason: 'restrict_shapeshift' }
      }
      if ((skill.id === 233 || skill.id === 243) && !inBear) {
        return { ok: false, reason: 'restrict_shapeshift' }
      }
    }
    if (
      skill.restrict === 0 &&
      inWolfOrBear &&
      skill.id !== 249 && // Armageddon usable in shapeshift
      skill.id !== 223 && // Werewolf toggle
      skill.id !== 228 && // Werebear toggle
      skill.id !== 0      // Attack usable in shapeshift
    ) {
      return { ok: false, reason: 'restrict_human' }
    }
    return { ok: true }
  }

  /**
   * 1.13c `D2Common.dll` `SKILLS_CheckSkillMana` (`0x6FDA0AF0` @ `0x6FDA0BEB`) & `D2Game.dll`
   * `SKILLS_CheckSkillMana` (`0x6FCBEC80` @ `0x6FCBECEF`) / `SKILLS_SrvDo116_Wearwolf_Wearbear` (`0x6FC66210`):
   * `nocostinstate = 1` (`Wearwolf` #223 `aurastate = wolf` #139, `Wearbear` #228 `aurastate = bear` #140)
   * waives mana cost only when the unit is already in the skill's shapeshift state (`auraState`).
   */
  private isNoCostInActiveState(skill: SkillRecord): boolean {
    if (!skill.noCostInState && !skill.nocostinstate) return false
    if (skill.auraState === 'wolf' || skill.id === 223) {
      return (
        this.stateBus.hasState('wolf') ||
        this.stateBus.hasState('wearwolf') ||
        this.stateBus.hasState(139)
      )
    }
    if (skill.auraState === 'bear' || skill.id === 228) {
      return (
        this.stateBus.hasState('bear') ||
        this.stateBus.hasState('wearbear') ||
        this.stateBus.hasState(140)
      )
    }
    return skill.auraState !== '' && this.stateBus.hasState(skill.auraState)
  }

  /**
   * Initiate a skill animation (`srvstfunc` phase).
   */
  startSkillAnimation(params: {
    skill: SkillRecord
    slvl: number
    currentTick: number
    targetX?: number
    targetY?: number
    onActionFrame?: (anim: ActiveAnimationState, tick: number) => void
  }): CastAttemptResult {
    const { skill, slvl, currentTick } = params
    if (skill.passive) {
      return { allowed: false, reason: 'passive_skill' }
    }

    // Check `STATE_SKILLDELAY` cooldown if the skill itself has a `delay` (`cd` skills)
    const delayTicks = skill.delay
      ? evaluateCalc(skill.delay, {
          registry: this.registry,
          activeSkill: skill,
          slvl,
          blvl: this.statList.getBaseSkillLevel(skill.id),
        })
      : 0

    if (delayTicks > 0 && this.isSkillDelayActive(currentTick)) {
      return { allowed: false, reason: 'skill_delay' }
    }

    // Check shapeshift `restrict`
    const restrictCheck = this.validateRestriction(skill)
    if (!restrictCheck.ok) {
      return { allowed: false, reason: restrictCheck.reason ?? 'restrict_shapeshift' }
    }

    // Check `startmana` & `manaCost256` before starting animation
    // 1.13c `D2Common.dll` `SKILLS_CheckStartMana` (0x6FD9FDC0) & `SKILLS_CheckSkillMana` (0x6FDA0AF0):
    // - `nocostinstate = 1` skips mana check only when the unit is already in `skill.auraState`.
    // - `startmana > 0` (`Inferno` #41, `Arctic Blast` #230, `Blade Fury` #266) requires
    //   `STAT_MANA >= (startMana << 8)` when not already channeling (`STATE_INFERNO = 12`).
    const isFreeInState = this.isNoCostInActiveState(skill)
    const { manaCost256 } = computeSkillManaCost256(skill, slvl)
    const inInfernoChannel =
      this.stateBus.hasState('inferno') || this.stateBus.hasState(12)
    if (!isFreeInState) {
      if (
        skill.startMana > 0 &&
        !inInfernoChannel &&
        this.statList.getMana256() < (skill.startMana << 8)
      ) {
        return { allowed: false, reason: 'insufficient_mana' }
      }
      if (this.statList.getMana256() < manaCost256) {
        if (skill.startMana > 0 && inInfernoChannel) {
          this.stateBus.removeState('inferno')
          this.stateBus.removeState(12)
        }
        return { allowed: false, reason: 'insufficient_mana' }
      }
    }
    // Resolve `AnimData.d2` COF record (`<TOKEN><MODE><WCLASS>`), honoring shapeshift morph tokens
    const inWolf = this.stateBus.hasState('wolf') || this.stateBus.hasState('wearwolf')
    const inBear = !inWolf && (this.stateBus.hasState('bear') || this.stateBus.hasState('wearbear'))
    const inVamp =
      !inWolf &&
      !inBear &&
      (this.stateBus.hasState('monsterset') || this.stateBus.hasState('vampire'))
    const activeToken = inWolf ? '40' : inBear ? 'TG' : inVamp ? 'VA' : this.charToken

    const rawMode = (skill.anim || 'SC').toUpperCase()
    const isSequence = rawMode === 'SQ'
    const mode = isSequence
      ? ((skill.seqTrans && skill.seqTrans.toUpperCase() !== 'SQ' ? skill.seqTrans : 'SC') || 'A1').toUpperCase()
      : rawMode

    // In 1.13c, morph forms (Wolf, Bear, Vampire) always use 'HTH' weapon class in AnimData.d2
    const activeWclass = inWolf || inBear || inVamp ? 'HTH' : this.weaponClass
    const cofName = `${activeToken}${mode}${activeWclass}`
    const animRecord = this.registry.getAnimDataRecord(cofName)
    if (!animRecord || !animRecord.hasSpeed) {
      return { allowed: false, reason: 'passive_skill' }
    }

    if (skill.startMana > 0) {
      // 1.13c `SkillSrvStFunc[11]` (0x6FC64550) -> `0x6FC643F0` (`Inferno` #41, `Arctic Blast` #230: 20f, +6f)
      // and `SkillSrvStFunc[26]` (0x6FCB5BC0) (`Blade Fury` #266: 21f, +7f) set `STATE_INFERNO` (12).
      const channelDuration =
        skill.id === 266 ? (inInfernoChannel ? 7 : 21) : inInfernoChannel ? 6 : 20
      this.stateBus.applyState({
        stateNameOrId: 'inferno',
        sourceSkillId: skill.id,
        slvl,
        durationFrames: channelDuration,
        currentFrame: currentTick,
      })
    }
    // 1.13c `D2Game.dll` `SKILLS_DoSkillStart` (0x6FCBFD00 @ 0x6FCBFE6C):
    // When `wSrvStFunc > 0` and `usemanaondo == 0`, mana is consumed at `SrvStFunc` start.
    // When `wSrvStFunc == 0` or `usemanaondo == 1` (`Plague Javelin` #25, `Blade Fury` #266),
    // mana is NOT consumed at start; it is checked and consumed in `SKILLS_DoSkillDo` (0x6FCC19A0).
    let manaDeductedOnStart = false
    if (!isFreeInState && skill.srvStFunc > 0 && !skill.useManaOnDo) {
      this.statList.setMana256(this.statList.getMana256() - manaCost256)
      manaDeductedOnStart = true
    }

    const seqTransUpper = (skill.seqTrans || '').toUpperCase()
    const isCastMode = mode === 'SC' || (isSequence && (seqTransUpper === 'SC' || seqTransUpper === 'SQ'))

    let stepSpeed256: number
    if ((inWolf || inBear) && !isCastMode) {
      // 1.13c D2Common shapeshift attack speed formula
      const weaponDelay = computeShapeshiftWeaponDelay113c(
        this.charToken,
        this.weaponClass,
        0,
        0,
        this.weaponClass !== 'HTH',
      )
      const baseSpeed = Math.max(1, Math.floor((animRecord.framesPerDirection * 256) / weaponDelay))
      const effIas = computeEffectiveIas({
        itemIas: this.statList.getAccruedStat('item_fasterattackrate'),
        skillIas: this.statList.getModifierBonus('attackrate') - (isSequence ? 30 : 0),
        weaponWsm: 0,
      })
      stepSpeed256 = Math.max(32, Math.trunc((baseSpeed * (100 + effIas)) / 100))
    } else {
      const effRate = isCastMode
        ? computeEffectiveFcr(this.statList.getAccruedStat('item_fastercastrate'))
        : computeEffectiveIas({
            itemIas: this.statList.getAccruedStat('item_fasterattackrate'),
            skillIas: this.statList.getModifierBonus('attackrate') - (isSequence ? 30 : 0),
            weaponWsm: 0,
          })
      stepSpeed256 = Math.max(32, Math.trunc((animRecord.animationSpeed * (100 + effRate)) / 100))
    }

    const seq0 = isSequence
      ? resolveSkillSequenceFrame(skill.id, this.weaponClass, 0, stepSpeed256)
      : null
    const framesPerDirection = seq0 ? seq0.totalSequenceFrames : animRecord.framesPerDirection
    const actionEvt = animRecord.events.find(e => (e.code & (0x01 | 0x02)) !== 0)
    // 1.13c D2Common parity: When no 0x01/0x02 event exists in AnimData.d2 (e.g. 40S1HTH, TGS1HTH, AIS3HT1),
    // the action triggers on completion (framesPerDirection - 1) rather than synthetic halfway frame.
    const actionFrame = actionEvt
      ? actionEvt.frame
      : Math.max(1, framesPerDirection - 1)

    this.currentAnim = {
      skill,
      slvl,
      cofName,
      animRecord,
      framesPerDirection,
      stepSpeed256,
      actionFrame,
      isSequence,
      targetX: params.targetX ?? 0,
      targetY: params.targetY ?? 0,
      manaDeductedOnStart,
      frameAcc256: 0,
      currentFrame: 0,
      actionTriggered: false,
      completed: false,
    }

    return {
      allowed: true,
      animState: this.currentAnim,
    }
  }

  /**
   * Advance the active animation by 1 tick (`25 Hz`), firing the action frame (`0x01`/`0x02`)
   * when `currentFrame >= actionFrame` and deducting mana / ammo / setting `STATE_SKILLDELAY`.
   */
  tick(
    currentTick: number,
    onActionFrame: (anim: ActiveAnimationState, tick: number) => void,
  ): { actionFired: boolean; anim: ActiveAnimationState | null } {
    if (!this.currentAnim || this.currentAnim.completed) {
      return { actionFired: false, anim: this.currentAnim }
    }

    const anim = this.currentAnim
    anim.frameAcc256 += anim.stepSpeed256
    anim.currentFrame = Math.trunc(anim.frameAcc256 / 256)

    let actionFired = false
    if (!anim.actionTriggered && anim.currentFrame >= anim.actionFrame) {
      anim.actionTriggered = true

      // 1.13c `D2Game.dll` `SKILLS_DoSkillDo` (`0x6FCC19A0` @ `0x6FCC1AE5` & `0x6FCC1C5F..0x6FCC1C8F`):
      // - When `usemanaondo == 1` (`Plague Javelin` #25, `Blade Fury` #266), verify `STAT_MANA >= manaCost256`
      //   on the `do` frame before executing `SkillSrvDoFunc`; abort without firing if mana dropped below cost.
      // - Consume `manaCost256` on the `do` frame when `wSrvStFunc == 0` or `usemanaondo == 1` (i.e. `!manaDeductedOnStart`),
      //   unless `nocostinstate` waives the cost while already in `skill.auraState`.
      const isFreeInState = this.isNoCostInActiveState(anim.skill)
      const { manaCost256 } = computeSkillManaCost256(anim.skill, anim.slvl)
      if (!isFreeInState && !anim.manaDeductedOnStart) {
        if (anim.skill.useManaOnDo && this.statList.getMana256() < manaCost256) {
          if (anim.skill.startMana > 0) {
            this.stateBus.removeState('inferno')
            this.stateBus.removeState(12)
          }
          anim.completed = true
          return { actionFired: false, anim }
        }
        this.statList.setMana256(this.statList.getMana256() - manaCost256)
      }

      actionFired = true

      // Deduct ammo quantity (`decquant`) if applicable
      // D2MOO Parity: SKILLS_SrvSt08_Strafe (skillId 26) explicitly calls sub_6FD118C0 to deduct 1 arrow on cast
      if ((anim.skill.decquant || anim.skill.id === 26) && this.getAmmoQuantity() > 0) {
        this.setAmmoQuantity(this.getAmmoQuantity() - 1)
      }

      // Apply `STATE_SKILLDELAY` (`delay` ticks in `Skills.txt`, e.g. Hydra 40f, Frozen Orb 25f)
      const delayTicks = anim.skill.delay
        ? evaluateCalc(anim.skill.delay, {
            registry: this.registry,
            activeSkill: anim.skill,
            slvl: anim.slvl,
            blvl: this.statList.getBaseSkillLevel(anim.skill.id),
          })
        : 0
      if (delayTicks > 0) {
        this.skillDelayExpireFrame = currentTick + delayTicks
        this.stateBus.applyState({
          stateNameOrId: 'skilldelay',
          slvl: 1,
          durationFrames: delayTicks,
          currentFrame: currentTick,
        })
      }

      onActionFrame(anim, currentTick)
    }

    // D2Common.dll #10426 (0x6FD7EF30):
    // - Sequence animations (0x6FD7EF57): complete when dwFrame >= dwFrameCount
    // - Standard one-shot animations (0x6FD7EF6D): complete when dwFrame + wAnimSpeed >= dwFrameCount
    if (anim.isSequence) {
      if (anim.currentFrame >= anim.framesPerDirection) {
        anim.completed = true
      }
    } else if (anim.frameAcc256 + anim.stepSpeed256 >= anim.framesPerDirection * 256) {
      anim.completed = true
    }

    return { actionFired, anim }
  }

  getCurrentAnimation(): ActiveAnimationState | null {
    return this.currentAnim
  }
}
