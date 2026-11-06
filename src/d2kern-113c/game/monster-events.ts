/**
 * Diablo II v1.13c Monster Event Dispatch (`0x6FC969A0`), Mode Tables (`0x6FD1A498` / `0x6FD1BC50`),
 * `SUNIT_IsDeadOrDying` (`0x6FCFFA90`), and Continuous Mode Persistent Registration (`0x6FD00B40`).
 *
 * Binary evidence: `kb/monsters/d2game-monster-events-113c.md`.
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import {
  D2AiGeneralStrc,
  D2EventStrc,
  D2GameStrc,
  D2MonsterDataStrc,
  D2TimerStrc,
  D2UnitStrc,
} from '../mem/layout.generated.ts'
import { STATES_CheckState113c } from '../common/statlist.ts'
import { UNIT_MONSTER, UNIT_PLAYER } from '../common/unit.ts'
import {
  EVENT_DeleteEventByType113c,
  EVENT_FLAG_DEFERRED_FREE,
  EVENT_FLAG_FIRING,
  EVENT_FreeNode113c,
  EVENT_SetPersistentEventFull113c,
  type EventDispatchCallback113c,
} from './timer-wheel.ts'

export const MON_EVENT_MODE_STEP = 0
export const MON_EVENT_MODE_END = 1
export const MON_EVENT_AI_THINK = 2
export const MON_EVENT_STAT_REGEN = 3

export const UNITFLAG_DEAD_113C = 0x00010000

/**
 * `D2Game 0x6FD1BC14[0..14]` monster event handler VA table (`D2Game.dll` base `0x6FC20000`).
 */
export const MONSTER_EVENT_HANDLER_VAS_113C: readonly number[] = [
  0x6fc952e0, // 0: MONSTER_Event0_ModeStep
  0x6fc952a0, // 1: MONSTER_Event1_ModeEnd
  0x6fcbd3b0, // 2: AI_RunMonsterAI
  0x6fc96740, // 3: MONSTER_Event3_HpRegen
  0x00000000, // 4: NULL
  0x6fcbe8e0, // 5: MONSTER_Event5_Timed
  0x6fc96570, // 6: MONSTER_Event6_UnsummonOrExpire
  0x6fc469b0, // 7: MONSTER_Event7_ConvertEnd
  0x6fcc1e80, // 8: MONSTER_Event8_AuraPulse
  0x6fcc37d0, // 9: MONSTER_Event9_BossEvent
  0x6fc94e40, // 10: MONSTER_Event10_Timed
  0x00000000, // 11: NULL
  0x6fc94870, // 12: MONSTER_Event12_Destroy
  0x00000000, // 13: NULL
  0x00000000, // 14: NULL
]

/**
 * Bitmask of `nEventType` (`0..14`) that bypass `STATE_FREEZE` (`state 1`) in `0x6FC969A0`
 * (`0x6FC969F8` + `0x6FC96A00[nEventType - 3] == 0`): `{3, 4, 5, 8, 12}`.
 */
export const MONSTER_EVENT_FREEZE_BYPASS_MASK_113C =
  (1 << 3) | (1 << 4) | (1 << 5) | (1 << 8) | (1 << 12)

export interface MonsterModeEntry113c {
  readonly mode: number
  readonly pfnStart: number
  readonly pfnStep: number
  readonly pfnEnd: number
  readonly scheduleEvents: number
}

/**
 * `D2Game 0x6FD1A498[0..15]` base monster mode table (`16` bytes per entry).
 */
export const MONSTER_MODE_TABLE_113C: readonly MonsterModeEntry113c[] = [
  { mode: 0, pfnStart: 0x6fc960b0, pfnStep: 0x6fc96ce0, pfnEnd: 0x6fc96040, scheduleEvents: 1 }, // DT
  { mode: 1, pfnStart: 0x6fc95bc0, pfnStep: 0x00000000, pfnEnd: 0x00000000, scheduleEvents: 0 }, // NU
  { mode: 2, pfnStart: 0x6fc956f0, pfnStep: 0x6fc96900, pfnEnd: 0x6fc95670, scheduleEvents: 1 }, // WL
  { mode: 3, pfnStart: 0x6fc95ba0, pfnStep: 0x6fc95070, pfnEnd: 0x6fc96bf0, scheduleEvents: 1 }, // GH
  { mode: 4, pfnStart: 0x6fc95bc0, pfnStep: 0x6fc96ce0, pfnEnd: 0x6fc96bf0, scheduleEvents: 1 }, // A1
  { mode: 5, pfnStart: 0x6fc95bc0, pfnStep: 0x6fc96ce0, pfnEnd: 0x6fc96bf0, scheduleEvents: 1 }, // A2
  { mode: 6, pfnStart: 0x6fc95bc0, pfnStep: 0x6fc950f0, pfnEnd: 0x6fc96bf0, scheduleEvents: 1 }, // BL
  { mode: 7, pfnStart: 0x6fc95bc0, pfnStep: 0x6fc96ce0, pfnEnd: 0x6fc96bf0, scheduleEvents: 1 }, // SC
  { mode: 8, pfnStart: 0x6fc95bc0, pfnStep: 0x6fc96ce0, pfnEnd: 0x6fc96bf0, scheduleEvents: 1 }, // S1
  { mode: 9, pfnStart: 0x6fc95bc0, pfnStep: 0x6fc96ce0, pfnEnd: 0x6fc96bf0, scheduleEvents: 1 }, // S2
  { mode: 10, pfnStart: 0x6fc95bc0, pfnStep: 0x6fc96ce0, pfnEnd: 0x6fc96bf0, scheduleEvents: 0 }, // S3
  { mode: 11, pfnStart: 0x6fc95bc0, pfnStep: 0x6fc96ce0, pfnEnd: 0x6fc96bf0, scheduleEvents: 0 }, // S4
  { mode: 12, pfnStart: 0x6fc95010, pfnStep: 0x00000000, pfnEnd: 0x00000000, scheduleEvents: 0 }, // DD
  { mode: 13, pfnStart: 0x6fc95a20, pfnStep: 0x6fc95900, pfnEnd: 0x6fc96bf0, scheduleEvents: 1 }, // KB
  { mode: 14, pfnStart: 0x6fc958a0, pfnStep: 0x6fc96830, pfnEnd: 0x6fc957d0, scheduleEvents: 1 }, // SQ
  { mode: 15, pfnStart: 0x6fc95770, pfnStep: 0x6fc96900, pfnEnd: 0x6fc95670, scheduleEvents: 1 }, // RN
]

const SPECIAL_MODE_273_S2: MonsterModeEntry113c = {
  mode: 9,
  pfnStart: 0x6fc95bc0,
  pfnStep: 0x6fc96ce0,
  pfnEnd: 0x6fc95320,
  scheduleEvents: 1,
}
const SPECIAL_MODE_297_SC: MonsterModeEntry113c = {
  mode: 7,
  pfnStart: 0x6fc95bc0,
  pfnStep: 0x6fc96d90,
  pfnEnd: 0x6fc96bf0,
  scheduleEvents: 1,
}
const SPECIAL_MODE_543_S1: MonsterModeEntry113c = {
  mode: 8,
  pfnStart: 0x6fc95bc0,
  pfnStep: 0x6fc96ce0,
  pfnEnd: 0x6fc95440,
  scheduleEvents: 1,
}
const SPECIAL_MODE_499_S4: MonsterModeEntry113c = {
  mode: 11,
  pfnStart: 0x6fc95bc0,
  pfnStep: 0x6fc96ce0,
  pfnEnd: 0x6fc95390,
  scheduleEvents: 1,
}
const SPECIAL_MODE_511_512_S1: MonsterModeEntry113c = {
  mode: 8,
  pfnStart: 0x6fc95bc0,
  pfnStep: 0x6fc96ce0,
  pfnEnd: 0x6fc95650,
  scheduleEvents: 1,
}
const SPECIAL_MODE_362_S1: MonsterModeEntry113c = {
  mode: 8,
  pfnStart: 0x6fc95bc0,
  pfnStep: 0x6fc95570,
  pfnEnd: 0x6fc955e0,
  scheduleEvents: 1,
}

/**
 * `D2Game 0x6FD1BC50[0..15]` continuous-mode flags (`d0 == 1` for `{2 WL, 13 KB, 14 SQ, 15 RN}`).
 */
export const MONSTER_CONTINUOUS_MODE_TABLE_113C: readonly number[] = [
  0, // 0: DT
  0, // 1: NU
  1, // 2: WL
  0, // 3: GH
  0, // 4: A1
  0, // 5: A2
  0, // 6: BL
  0, // 7: SC
  0, // 8: S1
  0, // 9: S2
  0, // 10: S3
  0, // 11: S4
  0, // 12: DD
  1, // 13: KB
  1, // 14: SQ
  1, // 15: RN
]

/** `D2Game 0x6FC949A0` (`MONSTER_GetModeEntry`, `ecx = pUnit`, `eax = nMode`). */
export function MONSTER_GetModeEntry113c(
  m: Memory113c,
  pUnit: number,
  mode: number,
): MonsterModeEntry113c | null {
  if ((mode >>> 0) >= 16) return null
  const classId = pUnit !== 0 ? m.get(pUnit, D2UnitStrc.dwClassId) : 0xffffffff
  if (mode === 9 && classId === 273) return SPECIAL_MODE_273_S2
  if (mode === 7 && classId === 297) return SPECIAL_MODE_297_SC
  if (mode === 8) {
    if (classId === 543) return SPECIAL_MODE_543_S1
    if (classId === 511 || classId === 512) return SPECIAL_MODE_511_512_S1
    if (classId === 362) return SPECIAL_MODE_362_S1
  }
  if (mode === 11 && classId === 499) return SPECIAL_MODE_499_S4
  return MONSTER_MODE_TABLE_113C[mode] ?? null
}

/** `D2Game 0x6FC94F20` (`MONSTER_IsContinuousMode`, `eax = nMode`). */
export function MONSTER_IsContinuousMode113c(mode: number): boolean {
  return (MONSTER_CONTINUOUS_MODE_TABLE_113C[mode >>> 0] ?? 0) !== 0
}

/** `D2Game 0x6FCFFA90` (`SUNIT_IsDeadOrDying`, `eax = pUnit`). */
export function SUNIT_IsDeadOrDying113c(m: Memory113c, pUnit: number): number {
  if (pUnit === 0) return 0
  if ((m.get(pUnit, D2UnitStrc.dwFlags) & UNITFLAG_DEAD_113C) !== 0) return 1
  const unitType = m.get(pUnit, D2UnitStrc.dwUnitType)
  const animMode = m.get(pUnit, D2UnitStrc.dwAnimMode)
  if (unitType === UNIT_PLAYER) {
    return animMode === 0 || animMode === 17 ? 1 : 0
  }
  if (unitType === UNIT_MONSTER) {
    return animMode === 0 || animMode === 12 ? 1 : 0
  }
  return 0
}

/** `D2Game 0x6FCAE940`: wrapper around `0x6FCAE810` with explicit `pfnHandler`. */
export function EVENT_SetPersistentEventWithHandler113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  type: number,
  arg14: number,
  arg18: number,
  handler: number,
): number {
  return EVENT_SetPersistentEventFull113c(m, pGame, pUnit, type, handler, arg14, arg18)
}

/** `D2Game 0x6FCAE960`: wrapper around `0x6FCAE810` with `pfnHandler = 0`. */
export function EVENT_SetPersistentUnitEvent113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  type: number,
  arg14: number,
  arg18: number,
): number {
  return EVENT_SetPersistentEventFull113c(m, pGame, pUnit, type, 0, arg14, arg18)
}

/**
 * `D2Game 0x6FD00750` (`MONSTER_ClearModeEvents`, `eax = pGame`, `ebx = pUnit`):
 * Frees all `nType == 0` (`MODE_STEP`) and `nType == 1` (`MODE_END`) nodes on `pUnit`
 * while preserving `nType == 2` (`AI_THINK`) and `nType == 3` (`STAT_REGEN`).
 */
export function MONSTER_ClearModeEvents113c(m: Memory113c, pGame: number, pUnit: number): void {
  if (pGame === 0 || pUnit === 0) return
  let cur = m.get(pUnit, D2UnitStrc.pEventFirst)
  while (cur !== 0) {
    const next = m.get(cur, D2EventStrc.pUnitNext)
    const evType = m.get(cur, D2EventStrc.nType)
    if (evType === MON_EVENT_MODE_STEP || evType === MON_EVENT_MODE_END) {
      EVENT_FreeNode113c(m, pGame, cur)
    }
    cur = next
  }
}

/**
 * `D2Game 0x6FD00B40` (`MONSTER_RegisterContinuousModeEvent`, `eax = pGame`, `[esp+4] = pUnit`):
 * Deletes any existing `nType == 0` node on `pUnit`, then registers a persistent `nType = 0`
 * (`dwFrame = 0xFFFFFFFF`, `fFlags |= 0x04`) node at the LIFO head of `pTimer->pPersistentHead[1]`.
 */
export function MONSTER_RegisterContinuousModeEvent113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
): number {
  if (pGame === 0 || pUnit === 0) return 0
  EVENT_DeleteEventByType113c(m, pGame, pUnit, MON_EVENT_MODE_STEP)
  return EVENT_SetPersistentEventFull113c(m, pGame, pUnit, MON_EVENT_MODE_STEP, 0, 0, 0)
}

export interface MonsterEventCallbacks113c {
  /** Override freeze check when `D2StatListEx` is not mirrored on `pUnit`. */
  readonly isFrozen?: (m: Memory113c, pUnit: number) => boolean
  readonly onModeStep?: (
    m: Memory113c,
    pGame: number,
    pUnit: number,
    entry: MonsterModeEntry113c,
    arg14: number,
    arg18: number,
  ) => void
  readonly onModeEnd?: (
    m: Memory113c,
    pGame: number,
    pUnit: number,
    entry: MonsterModeEntry113c,
    arg14: number,
    arg18: number,
  ) => void
  readonly onAiThink?: (
    m: Memory113c,
    pGame: number,
    pUnit: number,
    pAiGeneral: number,
    pfnThink: number,
    arg14: number,
    arg18: number,
  ) => void
  readonly onStatRegen?: (
    m: Memory113c,
    pGame: number,
    pUnit: number,
    arg14: number,
    arg18: number,
  ) => void
  readonly onOtherEvent?: (
    m: Memory113c,
    pGame: number,
    pUnit: number,
    eventType: number,
    handlerVa: number,
    arg14: number,
    arg18: number,
  ) => void
}

/** `D2Game 0x6FC952E0` (`MONSTER_Event0_ModeStep`). */
export function MONSTER_Event0_ModeStep113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  arg14: number,
  arg18: number,
  callbacks: MonsterEventCallbacks113c,
): void {
  if (pUnit === 0) return
  const mode = m.get(pUnit, D2UnitStrc.dwAnimMode)
  const entry = MONSTER_GetModeEntry113c(m, pUnit, mode)
  if (entry === null || entry.pfnStep === 0) {
    // 0x6FC950F0 fallback: clear mode events (`0x6FD00750`)
    MONSTER_ClearModeEvents113c(m, pGame, pUnit)
    return
  }
  callbacks.onModeStep?.(m, pGame, pUnit, entry, arg14, arg18)
}

/** `D2Game 0x6FC952A0` (`MONSTER_Event1_ModeEnd`). */
export function MONSTER_Event1_ModeEnd113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  arg14: number,
  arg18: number,
  callbacks: MonsterEventCallbacks113c,
): void {
  if (pUnit === 0) return
  const mode = m.get(pUnit, D2UnitStrc.dwAnimMode)
  const entry = MONSTER_GetModeEntry113c(m, pUnit, mode)
  if (entry === null || entry.pfnEnd === 0) {
    MONSTER_ClearModeEvents113c(m, pGame, pUnit)
    return
  }
  callbacks.onModeEnd?.(m, pGame, pUnit, entry, arg14, arg18)
}

/** `D2Game 0x6FCBD3B0` (`AI_RunMonsterAI`). */
export function AI_RunMonsterAI113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  arg14: number,
  arg18: number,
  callbacks: MonsterEventCallbacks113c,
): void {
  if (pUnit === 0 || m.get(pUnit, D2UnitStrc.dwUnitType) !== UNIT_MONSTER) return
  const pMonsterData = m.get(pUnit, D2UnitStrc.pUnitData)
  if (pMonsterData === 0) return
  const pAiGeneral = m.get(pMonsterData, D2MonsterDataStrc.pAiGeneral)
  if (pAiGeneral === 0) return
  const pfnThink = m.get(pAiGeneral, D2AiGeneralStrc.pfnThink)
  callbacks.onAiThink?.(m, pGame, pUnit, pAiGeneral, pfnThink, arg14, arg18)
}

/**
 * `D2Game 0x6FC969A0` (`MONSTER_DispatchEvent`):
 * Bounds check (`0 <= eventType < 15`), `STATE_FREEZE` guard (`0x6FC969A9..0x6FC969D4` + `0x6FCFFA90`),
 * and `0x6FD1BC14[eventType]` handler dispatch.
 */
export function MONSTER_DispatchEvent113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  eventType: number,
  arg14: number,
  arg18: number,
  callbacks: MonsterEventCallbacks113c,
): void {
  const ev = eventType | 0
  if (ev < 0 || ev >= 15 || pUnit === 0) return

  if (((MONSTER_EVENT_FREEZE_BYPASS_MASK_113C >>> ev) & 1) === 0) {
    const frozen = callbacks.isFrozen
      ? callbacks.isFrozen(m, pUnit)
      : STATES_CheckState113c(m, pUnit, 1) !== 0
    if (frozen && SUNIT_IsDeadOrDying113c(m, pUnit) === 0) {
      return
    }
  }

  const handlerVa = MONSTER_EVENT_HANDLER_VAS_113C[ev] ?? 0
  if (handlerVa === 0) return

  switch (ev) {
    case MON_EVENT_MODE_STEP:
      MONSTER_Event0_ModeStep113c(m, pGame, pUnit, arg14, arg18, callbacks)
      return
    case MON_EVENT_MODE_END:
      MONSTER_Event1_ModeEnd113c(m, pGame, pUnit, arg14, arg18, callbacks)
      return
    case MON_EVENT_AI_THINK:
      AI_RunMonsterAI113c(m, pGame, pUnit, arg14, arg18, callbacks)
      return
    case MON_EVENT_STAT_REGEN:
      callbacks.onStatRegen?.(m, pGame, pUnit, arg14, arg18)
      return
    default:
      callbacks.onOtherEvent?.(m, pGame, pUnit, ev, handlerVa, arg14, arg18)
  }
}

/**
 * Runs one partition of `EVENT_UpdateTimers` (`0x6FCAF070`), e.g. `partition = 1` (`UNIT_MONSTER`),
 * executing persistent events LIFO (`pPersistentHead[partition]`) followed by current slot (`frame & 63`)
 * FIFO (`pSlotTail -> pWheelNewer`).
 */
export function EVENT_UpdatePartition113c(
  m: Memory113c,
  pGame: number,
  partition: number,
  dispatch: EventDispatchCallback113c,
): number {
  const pTimer = m.get(pGame, D2GameStrc.pTimer)
  if (pTimer === 0) return 0
  const frame = m.get(pGame, D2GameStrc.dwGameFrame) >>> 0
  const slotMod = frame & 63
  m.set(pTimer, D2TimerStrc.nCurrentSlot, slotMod)

  let firedCount = 0

  let node = m.get(pTimer, D2TimerStrc.pPersistentHead, partition)
  while (node !== 0) {
    m.set(pTimer, D2TimerStrc.pSavedNext, m.get(node, D2EventStrc.pWheelNewer))
    m.set(node, D2EventStrc.fFlags, m.get(node, D2EventStrc.fFlags) | EVENT_FLAG_FIRING)
    const pUnit = m.get(node, D2EventStrc.pUnit)
    const evType = m.get(node, D2EventStrc.nType)
    const arg14 = m.get(node, D2EventStrc.dwArg14)
    const arg18 = m.get(node, D2EventStrc.dwArg18)
    const fn = m.get(node, D2EventStrc.pfnHandler)
    firedCount++
    dispatch(m, pGame, pUnit, evType, arg14, arg18, fn, node)

    const postFlags = m.get(node, D2EventStrc.fFlags) & ~EVENT_FLAG_FIRING
    m.set(node, D2EventStrc.fFlags, postFlags)
    if ((postFlags & EVENT_FLAG_DEFERRED_FREE) !== 0) {
      EVENT_FreeNode113c(m, pGame, node)
    }
    node = m.get(pTimer, D2TimerStrc.pSavedNext)
  }

  const slot = partition * 64 + slotMod
  node = m.get(pTimer, D2TimerStrc.pSlotTail, slot)
  while (node !== 0) {
    m.set(pTimer, D2TimerStrc.pSavedNext, m.get(node, D2EventStrc.pWheelNewer))
    if ((m.get(node, D2EventStrc.dwFrame) >>> 0) === frame) {
      m.set(node, D2EventStrc.fFlags, m.get(node, D2EventStrc.fFlags) | EVENT_FLAG_FIRING)
      const pUnit = m.get(node, D2EventStrc.pUnit)
      const evType = m.get(node, D2EventStrc.nType)
      const arg14 = m.get(node, D2EventStrc.dwArg14)
      const arg18 = m.get(node, D2EventStrc.dwArg18)
      const fn = m.get(node, D2EventStrc.pfnHandler)
      firedCount++
      dispatch(m, pGame, pUnit, evType, arg14, arg18, fn, node)

      const postFlags = m.get(node, D2EventStrc.fFlags) & ~EVENT_FLAG_FIRING
      m.set(node, D2EventStrc.fFlags, postFlags)
      EVENT_FreeNode113c(m, pGame, node)
    }
    node = m.get(pTimer, D2TimerStrc.pSavedNext)
  }
  m.set(pTimer, D2TimerStrc.pSavedNext, 0)
  return firedCount
}
