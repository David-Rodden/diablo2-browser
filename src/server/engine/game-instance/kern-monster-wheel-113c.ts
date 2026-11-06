/**
 * Isomorphic 1.13c Kernel Bridge (`src/d2kern-113c/`) for `GameInstanceHost` DRLG Monster Phase.
 *
 * Replaces all sequence-number stand-ins (`monsterEventSeqByHost113c`, `monsterMoveSeq113c`,
 * `allocateEvent3Seq113c`) and `.sort()` calls with a genuine `SparseMemory113c` + `D2GameStrc` +
 * 64-slot `D2TimerStrc` + `MONSTER_DispatchEvent113c` (`0x6FC969A0`) runtime.
 *
 * Binary evidence:
 * - `kb/monsters/d2game-monster-events-113c.md`
 * - `kb/engine/d2game-event-wheel-and-room-units-113c.md`
 */
import { SparseMemory113c } from '../../route2/sparse-memory.ts'
import {
  D2AiGeneralStrc,
  D2AiGeneralStrc_SIZE,
  D2EventStrc,
  D2GameStrc,
  D2MonsterDataStrc,
  D2MonsterDataStrc_SIZE,
  D2UnitStrc,
} from '../../route2/layout.generated.ts'
import {
  EVENT_DeleteEventByType113c,
  EVENT_FreeNode113c,
  EVENT_RemoveUnitEvents113c,
  EVENT_SetEventFull113c,
  EVENT_UpdatePartition113c,
  GAME_Create113c,
  MON_EVENT_AI_THINK,
  MON_EVENT_MODE_END,
  MON_EVENT_MODE_STEP,
  MON_EVENT_STAT_REGEN,
  MONSTER_ClearModeEvents113c,
  MONSTER_DispatchEvent113c,
  MONSTER_RegisterContinuousModeEvent113c,
  SUNIT_InsertServerUnit113c,
  SUNIT_RemoveServerUnit113c,
  UNIT_MONSTER,
  UNITFLAG_DEAD_113C,
  UNITS_Create113c,
  type MonsterEventCallbacks113c,
} from '../../../d2kern-113c/index.ts'
import type { GameInstanceHost } from './host.ts'
import type { InternalMonsterRecord } from './types.ts'

const EVENT_PARTITION_MONSTER_113C = 1
const ARG14_ACTION_END = 0
const ARG14_DEATH_END = 1
const ARG14_ACTION_KEYFRAME = 1

interface TrackedMonsterWheelState113c {
  readonly pUnit: number
  seenAi: number
  seenActEnd: number
  seenKeyframe: number
  seenDeathEnd: number
  seenEvent3: number
}

export class KernMonsterWheelRuntime113c {
  readonly mem = new SparseMemory113c()
  readonly pGame: number
  private readonly trackedByUnitId = new Map<number, TrackedMonsterWheelState113c>()
  private readonly unitIdByPtr = new Map<number, number>()
  private hooksInstalled = false

  constructor(host: GameInstanceHost) {
    this.pGame = GAME_Create113c(this.mem, {
      difficulty: host.difficulty,
      expansion: true,
      initTimerQueue: true,
    })
    this.mem.set(this.pGame, D2GameStrc.dwGameFrame, host.currentFrame >>> 0)
    this.installMoveHooks(host)
  }

  installMoveHooks(host: GameInstanceHost): void {
    if (this.hooksInstalled) return
    this.hooksInstalled = true
    host.areaPathWorld.setMonsterMoveEventHooks113c({
      onMoveStart: (unitId) => {
        if (host.drlgRoomPopulator === null) return
        const mon = host.monsters.get(unitId)
        if (mon === undefined || mon.isNpc || mon.dead) return
        const st = this.ensureMonsterUnit(mon)
        const moveMode = mon.mode === 15 ? 15 : 2
        this.mem.set(st.pUnit, D2UnitStrc.dwAnimMode, moveMode)
        MONSTER_RegisterContinuousModeEvent113c(this.mem, this.pGame, st.pUnit)
      },
      onMoveStop: (unitId, mode) => {
        const st = this.trackedByUnitId.get(unitId)
        if (st === undefined) return
        this.mem.set(st.pUnit, D2UnitStrc.dwAnimMode, mode >>> 0)
        this.deletePersistentModeStep(st.pUnit)
      },
    })
  }

  ensureMonsterUnit(mon: InternalMonsterRecord): TrackedMonsterWheelState113c {
    let st = this.trackedByUnitId.get(mon.unitId)
    if (st !== undefined) return st

    const pUnit = UNITS_Create113c(this.mem, UNIT_MONSTER, mon.hcIdx, mon.unitId, this.pGame)
    const pMonsterData = this.mem.alloc(D2MonsterDataStrc_SIZE)
    const pAiGeneral = this.mem.alloc(D2AiGeneralStrc_SIZE)
    // Non-zero sentinel VA (`AiZombie` `0x6FCA38B0` / `AiFallen` `0x6FCA3130`) so `AI_RunMonsterAI113c` validates `pAiGeneral`.
    this.mem.set(pAiGeneral, D2AiGeneralStrc.pfnThink, 0x6fca38b0)
    this.mem.set(pMonsterData, D2MonsterDataStrc.pAiGeneral, pAiGeneral)
    this.mem.set(pUnit, D2UnitStrc.pUnitData, pMonsterData)
    this.mem.set(pUnit, D2UnitStrc.dwAnimMode, mon.mode >>> 0)
    if (mon.dead) {
      this.mem.set(pUnit, D2UnitStrc.dwFlags, UNITFLAG_DEAD_113C)
    }
    SUNIT_InsertServerUnit113c(this.mem, this.pGame, pUnit)

    st = {
      pUnit,
      seenAi: Number.NaN,
      seenActEnd: 0,
      seenKeyframe: 0,
      seenDeathEnd: 0,
      seenEvent3: 0,
    }
    this.trackedByUnitId.set(mon.unitId, st)
    this.unitIdByPtr.set(pUnit, mon.unitId)
    return st
  }

  private deletePersistentModeStep(pUnit: number): void {
    let cur = this.mem.get(pUnit, D2UnitStrc.pEventFirst)
    while (cur !== 0) {
      const next = this.mem.get(cur, D2EventStrc.pUnitNext)
      if (
        this.mem.get(cur, D2EventStrc.nType) === MON_EVENT_MODE_STEP &&
        (this.mem.get(cur, D2EventStrc.dwFrame) >>> 0) === 0xffffffff
      ) {
        EVENT_FreeNode113c(this.mem, this.pGame, cur)
      }
      cur = next
    }
  }

  private deleteTimedModeEventsBySubKind(pUnit: number, evType: number, arg14: number): void {
    let cur = this.mem.get(pUnit, D2UnitStrc.pEventFirst)
    while (cur !== 0) {
      const next = this.mem.get(cur, D2EventStrc.pUnitNext)
      if (
        this.mem.get(cur, D2EventStrc.nType) === evType &&
        (this.mem.get(cur, D2EventStrc.dwFrame) >>> 0) !== 0xffffffff &&
        (this.mem.get(cur, D2EventStrc.dwArg14) >>> 0) === (arg14 >>> 0)
      ) {
        EVENT_FreeNode113c(this.mem, this.pGame, cur)
      }
      cur = next
    }
  }

  private scheduleAtFrame(
    pUnit: number,
    evType: number,
    targetFrame: number,
    arg14: number,
    hostFrame: number,
    beforeSlotDrain: boolean,
  ): void {
    const savedFrame = this.mem.get(this.pGame, D2GameStrc.dwGameFrame)
    const effectiveGameFrame = beforeSlotDrain && targetFrame <= hostFrame ? Math.max(0, hostFrame - 1) : hostFrame
    this.mem.set(this.pGame, D2GameStrc.dwGameFrame, effectiveGameFrame >>> 0)
    EVENT_SetEventFull113c(this.mem, this.pGame, pUnit, evType, targetFrame, 0, arg14, 0)
    this.mem.set(this.pGame, D2GameStrc.dwGameFrame, savedFrame >>> 0)
  }

  /**
   * Immediately schedule or re-arm `Event 3` (`MONSTER_Event3_HpRegen`, `0x6FC96740`) in FIFO order
   * at the exact damage / regen call site (`0x6FCFE31E` / `0x6FC968B0`).
   */
  scheduleEvent3(host: GameInstanceHost, mon: InternalMonsterRecord, targetFrame: number): void {
    mon.nextEvent3Frame113c = targetFrame
    if (host.drlgRoomPopulator === null || mon.isNpc || mon.dead) return
    this.mem.set(this.pGame, D2GameStrc.dwGameFrame, host.currentFrame >>> 0)
    const st = this.ensureMonsterUnit(mon)
    EVENT_DeleteEventByType113c(this.mem, this.pGame, st.pUnit, MON_EVENT_STAT_REGEN)
    this.scheduleAtFrame(st.pUnit, MON_EVENT_STAT_REGEN, targetFrame, 0, host.currentFrame, false)
    st.seenEvent3 = targetFrame
  }

  cancelEvent3(mon: InternalMonsterRecord): void {
    mon.nextEvent3Frame113c = undefined
    const st = this.trackedByUnitId.get(mon.unitId)
    if (st !== undefined) {
      EVENT_DeleteEventByType113c(this.mem, this.pGame, st.pUnit, MON_EVENT_STAT_REGEN)
      st.seenEvent3 = 0
    }
  }

  /**
   * Immediately clear live mode/AI/regen events and schedule `DT -> DD` (`Event 1`, `0x6FC96040`)
   * in FIFO order at the exact death site (`applyMonsterDeath` -> `MONSTER_ChangeMode(DT)` `0x6FC95E10`).
   */
  scheduleDeathEnd(host: GameInstanceHost, mon: InternalMonsterRecord, endFrame: number): void {
    mon.deathAnimEndFrame = endFrame
    if (host.drlgRoomPopulator === null) return
    this.mem.set(this.pGame, D2GameStrc.dwGameFrame, host.currentFrame >>> 0)
    const st = this.ensureMonsterUnit(mon)
    this.mem.set(st.pUnit, D2UnitStrc.dwAnimMode, 0)
    this.mem.set(
      st.pUnit,
      D2UnitStrc.dwFlags,
      (this.mem.get(st.pUnit, D2UnitStrc.dwFlags) | UNITFLAG_DEAD_113C) >>> 0,
    )
    MONSTER_ClearModeEvents113c(this.mem, this.pGame, st.pUnit)
    EVENT_DeleteEventByType113c(this.mem, this.pGame, st.pUnit, MON_EVENT_AI_THINK)
    EVENT_DeleteEventByType113c(this.mem, this.pGame, st.pUnit, MON_EVENT_STAT_REGEN)
    st.seenActEnd = 0
    st.seenKeyframe = 0
    st.seenEvent3 = 0
    if (endFrame > 0) {
      this.scheduleAtFrame(st.pUnit, MON_EVENT_MODE_END, endFrame, ARG14_DEATH_END, host.currentFrame, false)
      st.seenDeathEnd = endFrame
    } else {
      st.seenDeathEnd = 0
    }
  }

  syncMonster(host: GameInstanceHost, mon: InternalMonsterRecord, beforeSlotDrain: boolean): void {
    if (mon.isNpc) return
    const st = this.ensureMonsterUnit(mon)
    const pUnit = st.pUnit
    this.mem.set(pUnit, D2UnitStrc.dwAnimMode, mon.mode >>> 0)

    if (mon.dead) {
      this.mem.set(
        pUnit,
        D2UnitStrc.dwFlags,
        (this.mem.get(pUnit, D2UnitStrc.dwFlags) | UNITFLAG_DEAD_113C) >>> 0,
      )
      this.deletePersistentModeStep(pUnit)
      this.deleteTimedModeEventsBySubKind(pUnit, MON_EVENT_MODE_STEP, ARG14_ACTION_KEYFRAME)
      this.deleteTimedModeEventsBySubKind(pUnit, MON_EVENT_MODE_END, ARG14_ACTION_END)
      EVENT_DeleteEventByType113c(this.mem, this.pGame, pUnit, MON_EVENT_AI_THINK)
      EVENT_DeleteEventByType113c(this.mem, this.pGame, pUnit, MON_EVENT_STAT_REGEN)
      st.seenActEnd = 0
      st.seenKeyframe = 0
      st.seenEvent3 = 0

      const deathEnd = mon.deathAnimEndFrame ?? 0
      if (deathEnd !== st.seenDeathEnd) {
        this.deleteTimedModeEventsBySubKind(pUnit, MON_EVENT_MODE_END, ARG14_DEATH_END)
        st.seenDeathEnd = deathEnd
        if (mon.mode === 0 && deathEnd > 0) {
          this.scheduleAtFrame(pUnit, MON_EVENT_MODE_END, deathEnd, ARG14_DEATH_END, host.currentFrame, beforeSlotDrain)
        }
      }
      return
    }

    // Clear UNITFLAG_DEAD if resurrected (`reanimatedhorde` / shaman resurrection)
    const curFlags = this.mem.get(pUnit, D2UnitStrc.dwFlags)
    if ((curFlags & UNITFLAG_DEAD_113C) !== 0) {
      this.mem.set(pUnit, D2UnitStrc.dwFlags, (curFlags & ~UNITFLAG_DEAD_113C) >>> 0)
    }

    if (mon.mode !== 2 && mon.mode !== 15) {
      this.deletePersistentModeStep(pUnit)
    }

    const keyframe =
      mon.pendingAttack?.frame ??
      mon.pendingAllyAttack?.frame ??
      mon.pendingResurrection?.frame ??
      0
    if (keyframe !== st.seenKeyframe) {
      this.deleteTimedModeEventsBySubKind(pUnit, MON_EVENT_MODE_STEP, ARG14_ACTION_KEYFRAME)
      st.seenKeyframe = keyframe
      if (keyframe > 0) {
        this.scheduleAtFrame(
          pUnit,
          MON_EVENT_MODE_STEP,
          keyframe,
          ARG14_ACTION_KEYFRAME,
          host.currentFrame,
          beforeSlotDrain,
        )
      }
    }

    const actEnd = mon.actionAnimEndFrame ?? 0
    if (actEnd !== st.seenActEnd) {
      this.deleteTimedModeEventsBySubKind(pUnit, MON_EVENT_MODE_END, ARG14_ACTION_END)
      st.seenActEnd = actEnd
      if (actEnd > 0) {
        this.scheduleAtFrame(
          pUnit,
          MON_EVENT_MODE_END,
          actEnd,
          ARG14_ACTION_END,
          host.currentFrame,
          beforeSlotDrain,
        )
      }
    }

    const aiFrame = mon.nextAiFrame
    if (aiFrame !== st.seenAi) {
      EVENT_DeleteEventByType113c(this.mem, this.pGame, pUnit, MON_EVENT_AI_THINK)
      st.seenAi = aiFrame
      if (Number.isFinite(aiFrame) && aiFrame > 0) {
        this.scheduleAtFrame(pUnit, MON_EVENT_AI_THINK, aiFrame, 0, host.currentFrame, beforeSlotDrain)
      }
    }

    const ev3 = mon.nextEvent3Frame113c ?? 0
    if (ev3 !== st.seenEvent3) {
      EVENT_DeleteEventByType113c(this.mem, this.pGame, pUnit, MON_EVENT_STAT_REGEN)
      st.seenEvent3 = ev3
      if (ev3 > 0) {
        this.scheduleAtFrame(pUnit, MON_EVENT_STAT_REGEN, ev3, 0, host.currentFrame, beforeSlotDrain)
      }
    }
  }

  syncAllMonsters(host: GameInstanceHost, beforeSlotDrain: boolean): void {
    this.installMoveHooks(host)
    this.mem.set(this.pGame, D2GameStrc.dwGameFrame, host.currentFrame >>> 0)

    for (const [unitId, st] of [...this.trackedByUnitId.entries()]) {
      if (!host.monsters.has(unitId)) {
        EVENT_RemoveUnitEvents113c(this.mem, this.pGame, st.pUnit)
        SUNIT_RemoveServerUnit113c(this.mem, this.pGame, st.pUnit)
        this.trackedByUnitId.delete(unitId)
        this.unitIdByPtr.delete(st.pUnit)
      }
    }

    for (const mon of host.monsters.values()) {
      this.syncMonster(host, mon, beforeSlotDrain)
    }
  }

  /**
   * Execute the monster partition (`partition = 1`) of `EVENT_UpdateTimers` (`0x6FCAF070`) via
   * `MONSTER_DispatchEvent113c` (`0x6FC969A0`), with zero `.sort()` or sequence-number workarounds.
   */
  runMonsterEventPhase(
    host: GameInstanceHost,
    deferred: readonly InternalMonsterRecord[],
    stepMonsterAiAndPending: (host: GameInstanceHost, monster: InternalMonsterRecord) => void,
  ): void {
    this.mem.set(this.pGame, D2GameStrc.dwGameFrame, host.currentFrame >>> 0)
    const deferredSet = new Set<InternalMonsterRecord>(deferred)
    const done = new Set<InternalMonsterRecord>()

    const stepLiveMonster = (pUnit: number): void => {
      const unitId = this.unitIdByPtr.get(pUnit)
      if (unitId === undefined) return
      const mon = host.monsters.get(unitId)
      if (mon === undefined || mon.dead || !deferredSet.has(mon) || done.has(mon)) return
      done.add(mon)
      stepMonsterAiAndPending(host, mon)
      this.syncMonster(host, mon, false)
    }

    const callbacks: MonsterEventCallbacks113c = {
      isFrozen: (_m, pUnit) => {
        const unitId = this.unitIdByPtr.get(pUnit)
        const mon = unitId !== undefined ? host.monsters.get(unitId) : undefined
        return mon !== undefined ? mon.states.has(1) : false
      },
      onModeStep: (_m, _pGame, pUnit) => {
        stepLiveMonster(pUnit)
      },
      onModeEnd: (_m, _pGame, pUnit, _entry, arg14) => {
        const unitId = this.unitIdByPtr.get(pUnit)
        if (unitId === undefined) return
        const mon = host.monsters.get(unitId)
        if (mon === undefined) return
        if (arg14 === ARG14_DEATH_END) {
          if (mon.dead && mon.mode === 0) {
            mon.deathAnimEndFrame = 0
            mon.mode = 12
            this.mem.set(pUnit, D2UnitStrc.dwAnimMode, 12)
            const st = this.trackedByUnitId.get(unitId)
            if (st !== undefined) st.seenDeathEnd = 0
          }
          return
        }
        stepLiveMonster(pUnit)
      },
      onAiThink: (_m, _pGame, pUnit) => {
        stepLiveMonster(pUnit)
      },
      onStatRegen: (_m, _pGame, pUnit) => {
        const unitId = this.unitIdByPtr.get(pUnit)
        if (unitId === undefined) return
        const mon = host.monsters.get(unitId)
        if (mon === undefined || mon.dead || mon.isNpc) return
        const st = this.trackedByUnitId.get(unitId)
        if (st !== undefined) st.seenEvent3 = 0
        host.stepMonsterRegen(mon)
        this.syncMonster(host, mon, false)
      },
    }

    EVENT_UpdatePartition113c(
      this.mem,
      this.pGame,
      EVENT_PARTITION_MONSTER_113C,
      (m, pGame, pUnit, evType, arg14, arg18) => {
        MONSTER_DispatchEvent113c(m, pGame, pUnit, evType, arg14, arg18, callbacks)
      },
    )

    // Non-wheel per-frame counters (cooldowns, get-hit expiry, etc.) for monsters that did not fire a wheel event
    for (const mon of deferred) {
      if (mon.dead || done.has(mon)) continue
      stepMonsterAiAndPending(host, mon)
      this.syncMonster(host, mon, false)
    }
  }
}

const runtimeByHost113c = new WeakMap<GameInstanceHost, KernMonsterWheelRuntime113c>()

export function getKernMonsterWheelRuntime113c(host: GameInstanceHost): KernMonsterWheelRuntime113c {
  let rt = runtimeByHost113c.get(host)
  if (rt === undefined) {
    rt = new KernMonsterWheelRuntime113c(host)
    runtimeByHost113c.set(host, rt)
  }
  return rt
}

export function scheduleKernMonsterEvent3_113c(
  host: GameInstanceHost,
  monster: InternalMonsterRecord,
  targetFrame: number,
): void {
  getKernMonsterWheelRuntime113c(host).scheduleEvent3(host, monster, targetFrame)
}

export function cancelKernMonsterEvent3_113c(
  host: GameInstanceHost,
  monster: InternalMonsterRecord,
): void {
  if (host.drlgRoomPopulator === null) {
    monster.nextEvent3Frame113c = undefined
    return
  }
  getKernMonsterWheelRuntime113c(host).cancelEvent3(monster)
}

export function scheduleKernMonsterDeathEnd113c(
  host: GameInstanceHost,
  monster: InternalMonsterRecord,
  endFrame: number,
): void {
  getKernMonsterWheelRuntime113c(host).scheduleDeathEnd(host, monster, endFrame)
}
