/**
 * @file src/d2kern-113c/game/k3-p52-sorc-handlers-113c.ts
 * Clean-room 1:1 binary dispatch helpers for Milestone 34 (`[K3]`) Sorceress
 * longitudinal golden replays (`p52-sorceress-elemental`, `p52-sorceress-fire-dot`).
 *
 * Strictly pure `src/d2kern-113c/` imports only (zero legacy common or host imports).
 */

import { COLLISION_SetMaskWithPattern113c } from '../common/collision.ts'
import { ANIMSEQ_GetEventAtFrame113c } from '../common/composit.ts'
import { PATH_CheckFlag08_113c } from '../common/drlg/room-tile.ts'
import { imul32, sdiv32, smod32 } from '../common/int-math.ts'
import { DUNGEON_CheckRoomIsTownMemPort113c, SKILLS_GetUsedSkillMemPort113c } from '../common/k0-d2common-memports.ts'
import {
  MISSILE_GetElapsedFrames113c,
  MISSILE_GetLevel113c,
  MISSILE_GetRemainingFrames113c,
  MISSILE_GetSkill113c,
  MISSILE_GetTargetX113c,
  MISSILE_GetTargetY113c,
  MISSILE_SetTargetX113c,
  MISSILE_SetTargetY113c,
} from '../common/missile.ts'
import {
  PATH_Compute113c,
  PATH_SetTargetPos113c,
} from '../common/path.ts'
import { UNITS_GetRightSkill113c } from '../common/quest-record.ts'
import {
  SKILLS_EvalCalcByOffset113c,
  SKILLS_EvaluateSkillLevel113c,
  SKILLS_GetHighestLevelSkillFromUnitAndId113c,
  SKILLS_GetSkillIdFromSkill113c,
  SKILLS_GetSkillSlotIndex113c,
  SKILLS_GetSkillUseFailReason113c,
} from '../common/skills.ts'
import {
  STATES_CheckState113c,
  STATLIST_GetMaxLifeFromUnit113c,
  STATLIST_GetUnitStat113c,
  STATLIST_SetUnitStat113c,
} from '../common/statlist.ts'
import {
  UNITROOM_RefreshUnit113c,
  UNITS_GetAnimStartFrame113c,
  UNITS_GetRoom113c,
  UNITS_GetUnitSizeX113c,
  UNITS_SetSeqFrameFromLowByte113c,
} from '../common/unit.ts'
import { UNITS_SetTargetUnitForDynamicUnit113c } from '../common/waypoint.ts'
import { D2UnitStrc } from '../mem/layout.generated.ts'
import type { Memory113c } from '../mem/sparse-memory.ts'
import {
  SKILLS_DoUsedSkillAction113c,
  SKILLS_StartUsedSkill113c,
  SUNIT_AreUnitsHostileOrUnaligned113c,
  SUNIT_DispatchItemEventCallbacks113c,
} from './a1c-post150-f786-f1040-113c.ts'
import {
  MONSTER_ApplyCritDamage113c,
  SUNITDMG_FreeAttackerCombatList113c,
} from './ai-fallen-113c.ts'
import { MONSTER_DispatchMinionComponentCallbacks113c } from './boot-init-gap-a-113c.ts'
import {
  C2S_CheckCoordDeltaExceeded113c,
  C2S_ResolveDualWieldThrowSkill113c,
} from './c2s-packet-113c.ts'
import { SUNIT_GetServerUnit113c } from './game-strc.ts'
import { AURA_ForEachUnitInRadius113c } from './k2-gap-itemdef-113c.ts'
import {
  type K2GapMeleeDotHooks113c,
  MISSILES_GetTxtRecordFast113c,
  MISSILE_CreateServerProjectile113c,
  MISSILE_SrvDo01_FastcallThunk113c,
  MISSILE_SrvDo01_LinearProjectile113c,
  PLAYER_StartCastSkillAtCoords113c,
  SKILLS_SrvDo_NovaRing113c,
  STATES_ClearCurseStatesOnUnit113c,
} from './k2-gap-melee-dot-113c.ts'
import { MISSILES_SrvHit_RollKnockbackResult_6FC59670_113c } from './k2-laneK-0x6fc5-w1-113c.ts'
import {
  MISSILES_PopulateDamageByEType_6FC5A280_113c,
  MISSILES_SrvDmg12B_Nova64RingOnExpire_6FC5C850_113c,
} from './k2-w3b3-113c.ts'
import { MISSILES_SrvHit_ChainBounceProjectile_6FC5D020_113c } from './k2-w5b1-113c.ts'
import { SKILLS_SrvDo_FireWallPerpendicularControllers_6FC637D0_113c } from './k2-w6b1-113c.ts'
import { SKILLS_CreateDirectionalProjectileWithToHitAndAmmo_6FCC28F0_113c } from './k2-w6b2-113c.ts'
import {
  MISSILE_DefaultSrvHitFlagsK3_113c,
  MISSMODE_SrvDmg07_WarcryShockWaveK3_113c,
  MISSMODE_SrvHit18_ShoutBattleOrdersCommandK3_113c,
  PLAYER_CanStartModeAndSkillK3_113c,
  SKILLS_SrvDo068_BasicShoutK3_113c,
} from './k3-p52-handlers-113c.ts'
import {
  MONSTER_ClearModeEvents113c,
  SKILLS_SetUsedSkill113c,
  SUNIT_IsDeadOrDying113c,
  UNITS_ChangeAnimMode113c,
} from './monster-events.ts'
import {
  D2GAME_IAT_GDW_BITMASKS_VA_113C,
  D2GAME_IAT_SGPT_DATATABLES_VA_113C,
  MONSTATS_CheckFlagBit113c,
  MONSTATS_GetRecordPtr113c,
  SEED_RollLimitedFast113c,
  SKILLS_GetRecordPtrFast113c,
  SUNIT_InitUnitAnimData113c,
  SUNIT_ValidatePathTargetUnit113c,
  UNIT_GetPosX113c,
  UNIT_GetPosY113c,
} from './regpop-spawn-113c.ts'
import { EVENT_FreeNode113c, EVENT_SetEventFull113c } from './timer-wheel.ts'

let k3SorcScratchSp = 0x7ef70000

const RING_SIN_6FD1C960_113C: readonly number[] = [
  0, 2, 5, 8, 11, 14, 16, 19, 21, 23, 24, 26, 27, 28, 29, 29,
  30, 29, 29, 28, 27, 26, 24, 23, 21, 19, 16, 14, 11, 8, 5, 2,
  0, -2, -5, -8, -11, -14, -16, -19, -21, -23, -24, -26, -27, -28, -29, -29,
  -30, -29, -29, -28, -27, -26, -24, -23, -21, -19, -16, -14, -11, -8, -5, -2,
]

const RING_COS_6FD1CA60_113C: readonly number[] = [
  30, 29, 29, 28, 27, 26, 24, 23, 21, 19, 16, 14, 11, 8, 5, 2,
  0, -2, -5, -8, -11, -14, -16, -19, -21, -23, -24, -26, -27, -28, -29, -29,
  -30, -29, -29, -28, -27, -26, -24, -23, -21, -19, -16, -14, -11, -8, -5, -2,
  0, 2, 5, 8, 11, 14, 16, 19, 21, 23, 24, 26, 27, 28, 29, 29,
]

function sx16(v: number): number {
  return (v << 16) >> 16
}

function readSgptDataTablesK3_113c(m: Memory113c): number {
  const ptr = m.u32(D2GAME_IAT_SGPT_DATATABLES_VA_113C) >>> 0
  return ptr !== 0 ? (m.u32(ptr) >>> 0) : 0
}

function readGdwBitMaskByteK3_113c(m: Memory113c, offset: number): number {
  const pMasks = m.u32(D2GAME_IAT_GDW_BITMASKS_VA_113C) >>> 0
  if (pMasks === 0) return (1 << (offset >> 2)) & 0xff
  return m.u8((pMasks + offset) >>> 0)
}

function clearPendingPlayerSkillActionK3_113c(m: Memory113c, pPlayer: number): void {
  if (pPlayer === 0 || m.get(pPlayer, D2UnitStrc.dwUnitType) !== 0) return
  const pPlayerData = m.get(pPlayer, D2UnitStrc.pUnitData) >>> 0
  if (pPlayerData !== 0) {
    m.setU32((pPlayerData + 0x154) >>> 0, 0)
    m.setU32((pPlayerData + 0x150) >>> 0, 0)
  }
}

/**
 * `@va D2Game:0x6FCFF7B0`: schedules mode step (`0`) and mode end (`1`) events for both
 * `AnimData` modes and `PLRMODE_SEQUENCE (18)` (`pUnit + 0x30` `D2AnimSeqTxt*`).
 */
export function PLAYER_ScheduleModeAnimEventsK3_113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
): void {
  const u = pUnit >>> 0
  const g = pGame >>> 0
  let ebx = m.u32((g + 0xa8) >>> 0) | 0
  const startFrame = UNITS_GetAnimStartFrame113c(m, u) | 0
  let curFp8 = (startFrame << 8) | 0
  const pSeq = m.u32((u + 0x30) >>> 0)
  const stepFp8 = pSeq !== 0 ? (m.u32((u + 0x3c) >>> 0) | 0) : sx16(m.u16((u + 0x4c) >>> 0))
  const endFp8 = pSeq !== 0 ? (m.u32((u + 0x34) >>> 0) | 0) : (m.u32((u + 0x48) >>> 0) | 0)
  if (stepFp8 === 0) {
    const nextFrame = ((m.u32((g + 0xa8) >>> 0) | 0) + 1) | 0
    EVENT_SetEventFull113c(m, g, u, 1, nextFrame, 0, 0, 0)
    return
  }
  const pAnimData = m.u32((u + 0x50) >>> 0)
  let edi = curFp8 >> 8
  curFp8 = (curFp8 + stepFp8) | 0
  let stepIdx = 0
  const savedSp = k3SorcScratchSp
  const pEventScratch = savedSp
  k3SorcScratchSp = (savedSp + 16) >>> 0
  try {
    while (curFp8 < endFp8) {
      const nextFrameIdx = curFp8 >> 8
      ebx = (ebx + 1) | 0
      while (edi <= nextFrameIdx && edi < 0x90) {
        let evCode = 0
        const curSeq = m.u32((u + 0x30) >>> 0)
        if (curSeq !== 0) {
          m.setU32(pEventScratch, 0)
          ANIMSEQ_GetEventAtFrame113c(m, curSeq, (edi << 8) >>> 0, pEventScratch)
          evCode = m.u32(pEventScratch) | 0
        } else if (pAnimData !== 0) {
          evCode = m.u8((pAnimData + edi + 0x10) >>> 0)
        }
        if (evCode === 1 || evCode === 2 || evCode === 4) {
          EVENT_SetEventFull113c(m, g, u, 0, ebx, 0, evCode, stepIdx)
          stepIdx = (stepIdx + 1) | 0
        } else if (evCode === 3) {
          EVENT_SetEventFull113c(m, g, u, 0, ebx, 0, 3, 0)
        }
        edi = (edi + 1) | 0
      }
      curFp8 = (curFp8 + stepFp8) | 0
    }
  } finally {
    k3SorcScratchSp = savedSp
  }
  const gameFrame = m.u32((g + 0xa8) >>> 0) | 0
  if (ebx === gameFrame) {
    ebx = (ebx + 1) | 0
  }
  ebx = (ebx + 1) | 0
  EVENT_SetEventFull113c(m, g, u, 1, ebx, 0, 0, 0)
  m.setU32((u + 0x44) >>> 0, (m.u32((g + 0xa8) >>> 0) << 8) >>> 0)
}

/**
 * `@va D2Game:0x6FC987C0`: starts unit-targeted cast / sequence mode (`10` or `18`),
 * binds `pTargetUnit` via `D2Common.#11129`, initializes anim / sequence data (`0x6FCFFF10`),
 * schedules mode events (`0x6FCFF7B0`), clears `dwFlags & 0x40`, and runs `0x6FCC0830`.
 */
export function PLAYER_StartCastSkillOnUnitK3_113c(
  m: Memory113c,
  pGame: number,
  pPlayer: number,
  nMode: number,
  pTargetUnit: number,
): void {
  const game = pGame >>> 0
  const plr = pPlayer >>> 0
  SUNITDMG_FreeAttackerCombatList113c(m, plr, game)
  UNITS_ChangeAnimMode113c(m, plr, nMode | 0)
  UNITS_SetTargetUnitForDynamicUnit113c(m, plr, pTargetUnit >>> 0)
  SUNIT_InitUnitAnimData113c(m, plr)
  MONSTER_ClearModeEvents113c(m, game, plr)
  PLAYER_ScheduleModeAnimEventsK3_113c(m, game, plr)
  m.setU32((plr + 0xc4) >>> 0, (m.u32((plr + 0xc4) >>> 0) & 0xffffffbf) >>> 0)
  SUNIT_ValidatePathTargetUnit113c(m, plr, game)
  SKILLS_StartUsedSkill113c(m, plr, game)
}

/**
 * `@va D2Game:0x6FCEE520` (`0x0C` right skill on location) + `@va D2Game:0x6FCEE870` (`0x0D` right skill on unit):
 * Enforces the exact `50`-subtile (`0x32`) coordinate delta guard (`0x6FCEBF50` / `0x6FCED630` -> `0x6FCECFE0` -> `0x6FCEB690`),
 * `D2Common.#10787` (`SKILLS_GetSkillUseFailReason113c` mana/delay gate), and `D2Common.#10952` (`SKILLS_GetSkillSlotIndex113c`
 * `PLRMODE_CAST = 10` vs `PLRMODE_SEQUENCE = 18`).
 */
export function PLAYER_HandleC2SRightSkillK3_113c(
  m: Memory113c,
  pGame: number,
  pPlayer: number,
  packetBytes: Uint8Array,
  resolveUnit: (targetType: number, targetId: number) => number,
  syncPathUnit?: (mode: number, flags: number) => void,
): number {
  if (packetBytes.length === 0 || pPlayer === 0) return 0
  const op = packetBytes[0]!
  const view = new DataView(packetBytes.buffer, packetBytes.byteOffset, packetBytes.byteLength)

  if (UNITS_GetRoom113c(m, pPlayer) === 0) return 0
  const curMode = m.get(pPlayer, D2UnitStrc.dwAnimMode)
  if (curMode === 0 || curMode === 0x11) return 0
  if (
    m.get(pPlayer, D2UnitStrc.pStatListEx) !== 0 &&
    STATES_CheckState113c(m, pPlayer, 1) !== 0
  ) {
    return 0
  }

  if (op === 0x0c && packetBytes.length >= 5) {
    const x = view.getUint16(1, true)
    const y = view.getUint16(3, true)
    if (x === 0 || y === 0) return 0
    // 0x6FCEBF50 -> 0x6FCEB690(..., 0x32): reject |dx| > 50 or |dy| > 50
    if (C2S_CheckCoordDeltaExceeded113c(m, pPlayer, x, y, 50) !== 0) return 0

    let pSkill = UNITS_GetRightSkill113c(m, pPlayer) >>> 0
    if (pSkill === 0) return 0
    // 0x6FCEDF30: dual-wield throw substitution + D2Common.#10787 mana/charge/state check
    pSkill = C2S_ResolveDualWieldThrowSkill113c(m, pPlayer, pSkill) >>> 0
    let failReason = SKILLS_GetSkillUseFailReason113c(m, pPlayer, pSkill) | 0
    const skillId = SKILLS_GetSkillIdFromSkill113c(m, pSkill, 0, 0) | 0
    const pSkillsTxt = SKILLS_GetRecordPtrFast113c(m, skillId)
    if (pSkillsTxt === 0) return 0
    if (
      (failReason === 1 || failReason === 2 || failReason === 4) &&
      (m.u8((pSkillsTxt + 0x07) >>> 0) & readGdwBitMaskByteK3_113c(m, 0x10)) !== 0
    ) {
      pSkill = SKILLS_GetHighestLevelSkillFromUnitAndId113c(m, pPlayer, 0) >>> 0
      failReason = SKILLS_GetSkillUseFailReason113c(m, pPlayer, pSkill) | 0
    }
    const nTargetMode = SKILLS_GetSkillSlotIndex113c(m, pPlayer, pSkill) | 0
    if (nTargetMode === 0 || failReason !== 0) return 0

    if (PLAYER_CanStartModeAndSkillK3_113c(m, pPlayer, pGame, nTargetMode, pSkill) === 0) {
      return 0
    }
    clearPendingPlayerSkillActionK3_113c(m, pPlayer)
    SKILLS_SetUsedSkill113c(m, pPlayer, pSkill)
    PLAYER_StartCastSkillAtCoords113c(m, pGame, pPlayer, nTargetMode, x, y)
    if (syncPathUnit !== undefined) {
      syncPathUnit(m.get(pPlayer, D2UnitStrc.dwAnimMode), m.get(pPlayer, D2UnitStrc.dwFlags))
    }
    return 1
  }

  if (op === 0x0d && packetBytes.length >= 9) {
    const targetType = view.getUint32(1, true)
    const targetId = view.getUint32(5, true)
    if ((targetType >>> 0) >= 6) return 0
    const pTargetUnit = resolveUnit(targetType, targetId) >>> 0
    if (pTargetUnit === 0) return 0
    const tx = UNIT_GetPosX113c(m, pTargetUnit) | 0
    const ty = UNIT_GetPosY113c(m, pTargetUnit) | 0
    if (tx === 0 || ty === 0) return 0
    // 0x6FCED630 -> 0x6FCECFE0(..., 0x32) -> 0x6FCEB690: reject |dx| > 50 or |dy| > 50
    if (C2S_CheckCoordDeltaExceeded113c(m, pPlayer, tx, ty, 50) !== 0) return 0

    let pSkill = UNITS_GetRightSkill113c(m, pPlayer) >>> 0
    if (pSkill === 0) return 0
    pSkill = C2S_ResolveDualWieldThrowSkill113c(m, pPlayer, pSkill) >>> 0
    let failReason = SKILLS_GetSkillUseFailReason113c(m, pPlayer, pSkill) | 0
    const skillId = SKILLS_GetSkillIdFromSkill113c(m, pSkill, 0, 0) | 0
    const pSkillsTxt = SKILLS_GetRecordPtrFast113c(m, skillId)
    if (pSkillsTxt === 0) return 0
    if (
      (failReason === 1 || failReason === 2 || failReason === 4) &&
      (m.u8((pSkillsTxt + 0x07) >>> 0) & readGdwBitMaskByteK3_113c(m, 0x10)) !== 0
    ) {
      pSkill = SKILLS_GetHighestLevelSkillFromUnitAndId113c(m, pPlayer, 0) >>> 0
      failReason = SKILLS_GetSkillUseFailReason113c(m, pPlayer, pSkill) | 0
    }
    if (failReason !== 0) return 0
    const nTargetMode = SKILLS_GetSkillSlotIndex113c(m, pPlayer, pSkill) | 0
    if (nTargetMode === 0) return 0

    const allowAnyUnit =
      (m.u8((pSkillsTxt + 0x07) >>> 0) & readGdwBitMaskByteK3_113c(m, 0x0c)) !== 0
    const tSigned = targetType | 0
    if (!allowAnyUnit && (tSigned < 0 || (tSigned > 1 && tSigned !== 3))) {
      return 0
    }

    if (PLAYER_CanStartModeAndSkillK3_113c(m, pPlayer, pGame, nTargetMode, pSkill) === 0) {
      return 0
    }
    clearPendingPlayerSkillActionK3_113c(m, pPlayer)
    SKILLS_SetUsedSkill113c(m, pPlayer, pSkill)
    PLAYER_StartCastSkillOnUnitK3_113c(m, pGame, pPlayer, nTargetMode, pTargetUnit)
    if (syncPathUnit !== undefined) {
      syncPathUnit(m.get(pPlayer, D2UnitStrc.dwAnimMode), m.get(pPlayer, D2UnitStrc.dwFlags))
    }
    return 1
  }

  return 0
}

/**
 * `@va D2Game:0x6FC63720` (`SKILLS_SrvDo026_ChainLightning`):
 * Exact 1.13c port reading `sgptDataTables` `+0xba0` (`nSkillsTxtRecordCount`) / `+0xb98` (`pSkillsTxt`) /
 * `+0xb6c` (`nMissilesTxtRecordCount`), setting `pUnit->dwFlags |= 0x40`, spawning `wSrvMissileA (+0x48)`
 * via `0x6FCC28F0`, and storing `calc1 (+0x138)` bounce count into `MISSILE_SetTargetX113c` (`D2Common.#10637`).
 */
export function SKILLS_SrvDo026_ChainLightningK3_113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  nSkillId: number,
  nSkillLevel: number,
): number {
  const skillId = nSkillId | 0
  if (skillId < 0) return 0
  const pTables = readSgptDataTablesK3_113c(m)
  if (pTables === 0 || skillId >= (m.u32((pTables + 0xba0) >>> 0) | 0)) return 0
  const pSkillsBase = m.u32((pTables + 0xb98) >>> 0) >>> 0
  const pSkillsTxt = (pSkillsBase + imul32(skillId, 0x23c)) >>> 0
  if (pSkillsTxt === 0) return 0

  const nMissileId = sx16(m.u16((pSkillsTxt + 0x48) >>> 0))
  if (nMissileId < 0 || nMissileId >= (m.u32((pTables + 0xb6c) >>> 0) | 0)) return 0

  if (pUnit !== 0) {
    m.setU32((pUnit + 0xc4) >>> 0, (m.u32((pUnit + 0xc4) >>> 0) | 0x40) >>> 0)
  }
  const nBounces =
    SKILLS_EvalCalcByOffset113c(
      m,
      pUnit,
      m.u32((pSkillsTxt + 0x138) >>> 0),
      skillId,
      nSkillLevel | 0,
    ) | 0

  const pMissile =
    SKILLS_CreateDirectionalProjectileWithToHitAndAmmo_6FCC28F0_113c(
      m,
      pGame >>> 0,
      nMissileId,
      pUnit >>> 0,
      skillId,
      nSkillLevel | 0,
      0,
      0,
      0,
      0,
      0,
    ) >>> 0
  if (pMissile === 0) return 0
  MISSILE_SetTargetX113c(m, pMissile, nBounces)
  return 1
}

/**
 * `@va D2Game:0x6FCC2060` -> `@va D2Game:0x6FCC19A0`:
 * Executes `pUnit`'s used skill action, including the `0x6FCC1B3A..0x6FCC1C3D` default `wSrvMissile`
 * (`pSkillsTxt + 0x46 >= 0`) projectile spawn (`Fire Ball = 62`, `Frozen Orb = 260`, `Glacial Spike = 96`),
 * `SrvDo[22]` (`Nova`), `SrvDo[26]` (`Chain Lightning`), mana deduction, and `STATE_SKILLDELAY (121)`.
 */
export function SKILLS_DoUsedSkillActionK3_113c(
  m: Memory113c,
  pUnit: number,
  pGame: number,
  hooks: K2GapMeleeDotHooks113c,
): number {
  const pSkill = SKILLS_GetUsedSkillMemPort113c(m, pUnit) >>> 0
  if (pSkill === 0) return 0
  const nSkillId = SKILLS_GetSkillIdFromSkill113c(m, pSkill, 0, 0) | 0
  if (nSkillId < 0) return 0
  const pSkillsTxt = SKILLS_GetRecordPtrFast113c(m, nSkillId)
  if (pSkillsTxt === 0) return 0

  const pRoom = UNITS_GetRoom113c(m, pUnit)
  if (pRoom === 0) return 0
  if ((m.u8((pSkillsTxt + 0x06) >>> 0) & 0x20) === 0) {
    if (DUNGEON_CheckRoomIsTownMemPort113c(m, pRoom) !== 0) return 0
  }

  const srvDo2e = sx16(m.u16((pSkillsTxt + 0x2e) >>> 0))
  const wDoFuncIdx = srvDo2e !== 0 ? srvDo2e : sx16(m.u16((pSkillsTxt + 0x0a) >>> 0))
  const wSrvMissile = sx16(m.u16((pSkillsTxt + 0x46) >>> 0))
  if (wDoFuncIdx <= 0 && wSrvMissile >= 0 && MISSILES_GetTxtRecordFast113c(m, wSrvMissile) !== 0) {
    // 0x6FCC1B3A..0x6FCC1C3D: default `wSrvMissile` spawn before mana deduction & skilldelay
    const effLevel = SKILLS_EvaluateSkillLevel113c(m, pUnit, pSkill, 1) | 0
    m.setU32((pUnit + 0xc4) >>> 0, (m.u32((pUnit + 0xc4) >>> 0) | 0x40) >>> 0)
    SKILLS_CreateDirectionalProjectileWithToHitAndAmmo_6FCC28F0_113c(
      m,
      pGame >>> 0,
      wSrvMissile,
      pUnit >>> 0,
      nSkillId,
      effLevel,
      0,
      0,
      0,
      0,
      0,
    )
  }

  return SKILLS_DoUsedSkillAction113c(m, pUnit, pGame, (doIdx, skId, effLvl) => {
    if (doIdx === 22) {
      return SKILLS_SrvDo_NovaRing113c(m, pGame, pUnit, skId, effLvl, hooks)
    }
    if (doIdx === 24) {
      return SKILLS_SrvDo_FireWallPerpendicularControllers_6FC637D0_113c(m, pGame, pUnit, skId, effLvl)
    }
    if (doIdx === 26) {
      return SKILLS_SrvDo026_ChainLightningK3_113c(m, pGame, pUnit, skId, effLvl)
    }
    if (doIdx === 68) {
      return SKILLS_SrvDo068_BasicShoutK3_113c(m, pGame, pUnit, skId, effLvl, hooks)
    }
    return 1
  })
}

/**
 * `@va D2Game:0x6FC99170`: player mode-step handler for `PLRMODE_CAST (10)` and non-melee
 * `PLRMODE_SEQUENCE (18)` skills (`Chain Lightning` `#53`).
 */
export function PLAYER_StepSkillKeyframeK3_113c(
  m: Memory113c,
  pGame: number,
  pPlayer: number,
  arg14: number,
  arg18: number,
  hooks: K2GapMeleeDotHooks113c,
): void {
  if (pPlayer === 0 || m.u32((pPlayer + 0x2c) >>> 0) === 0) return
  if (m.u32((pPlayer + 0x30) >>> 0) !== 0) {
    UNITS_SetSeqFrameFromLowByte113c(m, pPlayer, arg18 | 0)
  }
  const alreadyFired = ((m.u32((pPlayer + 0xc4) >>> 0) >>> 6) & 1) !== 0
  if (!alreadyFired && (arg14 === 1 || arg14 === 2)) {
    SKILLS_DoUsedSkillActionK3_113c(m, pPlayer, pGame, hooks)
  }
}

/**
 * Returns `true` when `pPlayer` in `PLRMODE_SEQUENCE (18)` is executing a spell/non-melee skill
 * (`skillId > 0` and `wSrvDoFunc !== 1`).
 */
export function PLAYER_IsNonMeleeSequenceSkillK3_113c(m: Memory113c, pPlayer: number): boolean {
  const pSkill = SKILLS_GetUsedSkillMemPort113c(m, pPlayer) >>> 0
  if (pSkill === 0) return false
  const skillId = SKILLS_GetSkillIdFromSkill113c(m, pSkill, 0, 0) | 0
  if (skillId <= 0) return false
  const pSkillsTxt = SKILLS_GetRecordPtrFast113c(m, skillId)
  if (pSkillsTxt === 0) return false
  const wSrvDo = sx16(m.u16((pSkillsTxt + 0x2e) >>> 0))
  return wSrvDo !== 1
}

function applySingleResistChannelK3_113c(
  m: Memory113c,
  pDefender: number,
  rawDmg: number,
  resistStatId: number,
  maxResistStatId: number,
  piercePct: number,
): number {
  let dmg = rawDmg | 0
  if (dmg <= 0) return 0
  let res = STATLIST_GetUnitStat113c(m, pDefender, resistStatId, 0) | 0
  if (res < 100 || m.u32(pDefender >>> 0) === 0) {
    if (piercePct !== 0) res = (res - piercePct) | 0
  }
  if (maxResistStatId >= 0 && m.u32(pDefender >>> 0) === 0) {
    let cap = 75
    if (maxResistStatId > 0) {
      cap = (75 + (STATLIST_GetUnitStat113c(m, pDefender, maxResistStatId, 0) | 0)) | 0
    }
    if (cap >= 95) cap = 95
    if (res >= cap) res = cap
  }
  if (resistStatId === 0x24 && m.u32(pDefender >>> 0) === 0 && res > 50) {
    res = 50
  }
  if (res < -100) res = -100
  if (res > 0 && m.u32(pDefender >>> 0) === 1 && res >= 100) return 0
  if (res !== 0) {
    dmg = (dmg - sdiv32(imul32(dmg, res), 100)) | 0
  }
  return dmg > 0 ? dmg : 0
}

/**
 * `@va D2Game:0x6FCC10B0` -> `@va D2Game:0x6FCFE0C0` + `@va D2Game:0x6FCFCF20`:
 * Exact single-application radial skill damage pipeline for `Fire Ball` (`0x6FC5B990` -> `0x6FCC1210`),
 * forwarding `hooks` so lethal radial splash invokes `MONSTER_StartDeath113c` (`killUnit`).
 */
function applyRadialSkillDamageToTargetK3_113c(
  m: Memory113c,
  pGame: number,
  pOwner: number,
  pDefender: number,
  pDmg: number,
  hooks: K2GapMeleeDotHooks113c,
): void {
  const g = pGame >>> 0
  const att = pOwner >>> 0
  const def = pDefender >>> 0
  const dmg = pDmg >>> 0
  if (att === 0 || def === 0) return

  if ((m.u8((dmg + 0x04) >>> 0) & 0x01) !== 0 && STATES_CheckState113c(m, def, 0x36) === 0) {
    m.setU8((dmg + 0x04) >>> 0, (m.u8((dmg + 0x04) >>> 0) | 0x04) & 0xff)
  }
  MONSTER_ApplyCritDamage113c(m, att, dmg, def)

  if ((m.u8((dmg + 0x04) >>> 0) & 0x01) !== 0) {
    // 0x6FCFE0C0(bApplyResists = 1)
    const hostile = SUNIT_AreUnitsHostileOrUnaligned113c(m, att, def, g)
    const combatFlags = m.u32(dmg)
    const pDefRoom = UNITS_GetRoom113c(m, def)
    if (hostile === 0 && (combatFlags & 0x1000) === 0) {
      m.setU8((dmg + 0x04) >>> 0, m.u8((dmg + 0x04) >>> 0) & 0xfc)
    } else if (pDefRoom === 0 || DUNGEON_CheckRoomIsTownMemPort113c(m, pDefRoom) !== 0) {
      m.setU8((dmg + 0x04) >>> 0, m.u8((dmg + 0x04) >>> 0) & 0xfc)
    } else {
      const defType = m.u32(def) | 0
      const canHurt =
        (defType !== 1 || MONSTATS_CheckFlagBit113c(m, m.u32((def + 0x04) >>> 0) | 0, 0x0f) !== 0) &&
        SUNIT_IsDeadOrDying113c(m, def) === 0
      if (canHurt) {
        const piercePct = m.u32((dmg + 0x54) >>> 0) | 0
        let phys = applySingleResistChannelK3_113c(m, def, m.u32((dmg + 0x08) >>> 0) | 0, 0x24, 0, 0)
        const fire = applySingleResistChannelK3_113c(m, def, m.u32((dmg + 0x10) >>> 0) | 0, 0x27, 0x28, piercePct)
        const ltng = applySingleResistChannelK3_113c(m, def, m.u32((dmg + 0x1c) >>> 0) | 0, 0x29, 0x2a, piercePct)
        const mag = applySingleResistChannelK3_113c(m, def, m.u32((dmg + 0x24) >>> 0) | 0, 0x25, 0x26, 0)
        const cold = applySingleResistChannelK3_113c(m, def, m.u32((dmg + 0x20) >>> 0) | 0, 0x2b, 0x2c, piercePct)
        const pois = applySingleResistChannelK3_113c(m, def, m.u32((dmg + 0x28) >>> 0) | 0, 0x2d, 0x2e, piercePct)
        m.setU32((dmg + 0x08) >>> 0, phys >>> 0)
        m.setU32((dmg + 0x10) >>> 0, fire >>> 0)
        m.setU32((dmg + 0x1c) >>> 0, ltng >>> 0)
        m.setU32((dmg + 0x24) >>> 0, mag >>> 0)
        m.setU32((dmg + 0x20) >>> 0, cold >>> 0)
        m.setU32((dmg + 0x28) >>> 0, pois >>> 0)

        const curHp = STATLIST_GetUnitStat113c(m, def, 0x06, 0) | 0
        if (phys > curHp) {
          phys = curHp
          m.setU32((dmg + 0x08) >>> 0, phys >>> 0)
        }
        const dwDmgTotal = (phys + fire + ltng + mag + cold + pois) | 0
        m.setU32((dmg + 0x4c) >>> 0, dwDmgTotal >>> 0)
        if (dwDmgTotal > 0) {
          let nextHp = (curHp - dwDmgTotal) | 0
          if (nextHp < 0x100) nextHp = 0
          STATLIST_SetUnitStat113c(m, def, 0x06, nextHp, 0)
        }
        const afterHp = STATLIST_GetUnitStat113c(m, def, 0x06, 0) | 0
        if (afterHp > 0) {
          m.setU8((dmg + 0x04) >>> 0, m.u8((dmg + 0x04) >>> 0) & 0xfd)
          if (dwDmgTotal !== 0 && defType === 1) {
            if ((STATLIST_GetUnitStat113c(m, def, 0x4a, 0) | 0) !== 0) {
              let ev = m.u32((def + 0xdc) >>> 0)
              while (ev !== 0) {
                const nextEv = m.u32((ev + 0x24) >>> 0)
                if (m.u8(ev) === 3) EVENT_FreeNode113c(m, g, ev)
                ev = nextEv
              }
              const nextFrame = ((m.u32((g + 0xa8) >>> 0) | 0) + 1) | 0
              EVENT_SetEventFull113c(m, g, def, 3, nextFrame, 0, 0, 0)
            } else {
              STATES_ClearCurseStatesOnUnit113c(m, def)
            }
          }
        } else {
          m.setU8((dmg + 0x04) >>> 0, (m.u8((dmg + 0x04) >>> 0) | 0x02) & 0xff)
        }
        const finalFlags = m.u16((dmg + 0x04) >>> 0)
        if ((finalFlags & 0x20) === 0 && (finalFlags & 0x02) !== 0) {
          SUNIT_DispatchItemEventCallbacks113c(m, def, g, 0x0a, att, dmg)
          SUNIT_DispatchItemEventCallbacks113c(m, att, g, 0x09, def, dmg)
        }
      }
    }
  }

  // 0x6FCFCF20 post-damage result
  if ((m.u8((dmg + 0x04) >>> 0) & 0x01) !== 0) {
    m.setU32((def + 0xb0) >>> 0, m.u32((dmg + 0x60) >>> 0))
  }
  if (STATES_CheckState113c(m, def, 0x36) !== 0) return
  if ((m.u32(def) | 0) === 1) {
    const curMode = m.u32((def + 0x10) >>> 0) | 0
    if (curMode === 0 || curMode === 0x0c) return
    const flags = m.u16((dmg + 0x04) >>> 0)
    if ((flags & 0x02) !== 0) {
      if (hooks.killUnit !== undefined) {
        hooks.killUnit(m, g, def, att, 1)
      }
      return
    }
    if ((flags & 0x4000) !== 0) {
      UNITROOM_RefreshUnit113c(m, def)
      m.setU32((def + 0xc4) >>> 0, (m.u32((def + 0xc4) >>> 0) | 0x8000) >>> 0)
      MONSTER_DispatchMinionComponentCallbacks113c(m, g, def, 4)
      return
    }
    if ((flags & 0x01) !== 0 && (m.u32((dmg + 0x4c) >>> 0) | 0) > 0) {
      const prevPct = STATLIST_GetUnitStat113c(m, def, 0x160, 0) & 0xff
      const hpShr8 = (STATLIST_GetUnitStat113c(m, def, 0x06, 0) | 0) >> 8
      const maxShr8 = (STATLIST_GetMaxLifeFromUnit113c(m, def) | 0) >> 8
      const newPct =
        maxShr8 <= 0 || hpShr8 >= maxShr8 ? 0x80 : (sdiv32(hpShr8 << 7, maxShr8) & 0xff)
      const diff = prevPct >= newPct ? prevPct - newPct : newPct - prevPct
      if (diff > 4) {
        UNITROOM_RefreshUnit113c(m, def)
        m.setU32((def + 0xc4) >>> 0, (m.u32((def + 0xc4) >>> 0) | 0x8000) >>> 0)
      }
    }
  }
  void MONSTATS_GetRecordPtr113c
}

/**
 * `@va D2Game:0x6FC5B990` (`MISSILE_SrvHit01_Fireball`):
 * Populates missile elemental damage (`0x6FC5A280`) and deals radial splash damage (`0x8583`)
 * within `dwParam1` / `calc1` radius using exact `0x6FCC10B0` single-application damage + `killUnit`.
 */
export function MISSILE_SrvHit01_FireBallRadialK3_113c(
  m: Memory113c,
  pGame: number,
  pMissile: number,
  pHitUnit: number,
  hooks: K2GapMeleeDotHooks113c,
): number {
  const game = pGame >>> 0
  const mis = pMissile >>> 0
  if (mis === 0) return 1
  const pMissilesTxt = MISSILES_GetTxtRecordFast113c(m, m.u32((mis + 0x04) >>> 0) | 0) >>> 0
  if (pMissilesTxt === 0) return 1
  if (((m.u32((mis + 0xc8) >>> 0) >>> 10) & 1) === 0) return 1
  const pOwner =
    SUNIT_GetServerUnit113c(
      m,
      game,
      m.u32((mis + 0x94) >>> 0) | 0,
      m.u32((mis + 0x98) >>> 0) | 0,
    ) >>> 0
  if (pOwner === 0) return 1

  let nRadius = m.u32((pMissilesTxt + 0x4c) >>> 0) | 0
  if (nRadius <= 0) {
    const nSkill = MISSILE_GetSkill113c(m, mis) | 0
    const nLevel = MISSILE_GetLevel113c(m, mis) | 0
    const pSkillsTxt = SKILLS_GetRecordPtrFast113c(m, nSkill)
    if (pSkillsTxt === 0) return 1
    nRadius =
      SKILLS_EvalCalcByOffset113c(m, pOwner, m.u32((pSkillsTxt + 0x138) >>> 0), nSkill, nLevel) | 0
    if (nRadius < 1) nRadius = 1
  }

  const posX = UNIT_GetPosX113c(m, mis) | 0
  const posY = UNIT_GetPosY113c(m, mis) | 0

  const savedSp = k3SorcScratchSp
  const pDmg = savedSp
  const pDmgCopy = (savedSp + 0x74) >>> 0
  k3SorcScratchSp = (savedSp + 0xe8) >>> 0
  try {
    m.fill(pDmg, 0x70, 0)
    MISSILES_PopulateDamageByEType_6FC5A280_113c(m, mis, pDmg, pHitUnit >>> 0)
    m.setU32(pDmg, (m.u32(pDmg) | m.u32((pMissilesTxt + 0xa8) >>> 0)) >>> 0)
    m.setU16(
      (pDmg + 0x04) >>> 0,
      (m.u16((pDmg + 0x04) >>> 0) | m.u16((pMissilesTxt + 0xac) >>> 0)) & 0xffff,
    )
    AURA_ForEachUnitInRadius113c(
      m,
      game,
      pOwner,
      posX,
      posY,
      nRadius,
      0x8583,
      0x6fcc1210,
      pDmg,
      0,
      (mem, pAuraCtx, pTarget) => {
        const src = mem.u32((pAuraCtx + 0x0c) >>> 0) >>> 0
        for (let i = 0; i < 0x1c; i++) {
          mem.setU32((pDmgCopy + i * 4) >>> 0, mem.u32((src + i * 4) >>> 0))
        }
        applyRadialSkillDamageToTargetK3_113c(
          mem,
          mem.u32(pAuraCtx >>> 0) >>> 0,
          mem.u32((pAuraCtx + 0x04) >>> 0) >>> 0,
          pTarget >>> 0,
          pDmgCopy,
          hooks,
        )
        return 1
      },
    )
    return 1
  } finally {
    k3SorcScratchSp = savedSp
  }
}

/**
 * `@va D2Game:0x6FC60CA0` (`MISSMODE_SrvDo15_FrozenOrb`):
 * Spawns radial `icebolt` sub-missiles using `0x6FD1CA60`/`0x6FD1C960` and forwards `hooks`
 * into `MISSILE_SrvDo01_LinearProjectile113c` so `AlwaysExplode` invokes `SrvHit[29]` (`0x6FC5C850`).
 */
export function MISSILE_SrvDo15_FrozenOrbK3_113c(
  m: Memory113c,
  pGame: number,
  pMissile: number,
  hooks: K2GapMeleeDotHooks113c,
): number {
  if (pMissile === 0) return 2
  const pMissilesTxt = MISSILES_GetTxtRecordFast113c(m, m.u32((pMissile + 0x04) >>> 0) | 0) >>> 0
  if (pMissilesTxt === 0 || sx16(m.u16((pMissilesTxt + 0x18) >>> 0)) < 0) return 2
  if (((m.u32((pMissile + 0xc8) >>> 0) >>> 10) & 1) === 0) return 2
  const pOwner =
    SUNIT_GetServerUnit113c(
      m,
      pGame,
      m.u32((pMissile + 0x94) >>> 0) | 0,
      m.u32((pMissile + 0x98) >>> 0) | 0,
    ) >>> 0
  if (pOwner === 0) return 2

  let nStep = m.u32((pMissilesTxt + 0x38) >>> 0) | 0
  if (nStep < 1) nStep = 1
  const nElapsed = MISSILE_GetElapsedFrames113c(m, pMissile) | 0
  if (smod32(nElapsed, nStep) > 0) {
    return MISSILE_SrvDo01_LinearProjectile113c(m, pMissile, pGame, hooks) | 0
  }

  const savedSp = k3SorcScratchSp
  const pParams = savedSp
  k3SorcScratchSp = (savedSp + 0x60) >>> 0
  try {
    m.fill(pParams, 0x5c, 0)
    m.setU32(pParams, 2)
    m.setU32((pParams + 0x04) >>> 0, pOwner)
    m.setU32((pParams + 0x08) >>> 0, pMissile >>> 0)
    m.setU32((pParams + 0x2c) >>> 0, (MISSILE_GetSkill113c(m, pMissile) | 0) >>> 0)
    m.setU32((pParams + 0x30) >>> 0, (MISSILE_GetLevel113c(m, pMissile) | 0) >>> 0)
    m.setU32((pParams + 0x10) >>> 0, sx16(m.u16((pMissilesTxt + 0x18) >>> 0)) >>> 0)

    const rawAngle = MISSILE_GetTargetX113c(m, pMissile) | 0
    let idx = smod32(rawAngle, 64)
    if (idx < 0) idx = (-idx) | 0
    const cosVal = RING_COS_6FD1CA60_113C[idx]!
    const sinVal = RING_SIN_6FD1C960_113C[idx]!
    m.setU32((pParams + 0x1c) >>> 0, cosVal >>> 0)
    m.setU32((pParams + 0x20) >>> 0, sinVal >>> 0)

    const nextAngle = smod32((idx + (m.u32((pMissilesTxt + 0x3c) >>> 0) | 0)) | 0, 64)
    MISSILE_SetTargetX113c(m, pMissile, nextAngle)
    MISSILE_CreateServerProjectile113c(m, pGame, pParams, hooks)
  } finally {
    k3SorcScratchSp = savedSp
  }
  return MISSILE_SrvDo01_LinearProjectile113c(m, pMissile, pGame, hooks) | 0
}

/**
 * `@va D2Game:0x6FC60BD0` (`MISSMODE_SrvDo16_FrozenOrbNova`):
 * Spiral path rotation + `MISSILE_SrvDo01_LinearProjectile113c` forwarding `hooks`.
 */
export function MISSILE_SrvDo16_SpiralPathK3_113c(
  m: Memory113c,
  pGame: number,
  pMissile: number,
  hooks: K2GapMeleeDotHooks113c,
): number {
  if (pMissile === 0) return 2
  const pMissilesTxt = MISSILES_GetTxtRecordFast113c(m, m.u32((pMissile + 0x04) >>> 0) | 0) >>> 0
  if (pMissilesTxt === 0) return 2
  let nStep = m.u32((pMissilesTxt + 0x3c) >>> 0) | 0
  if (nStep < 1) nStep = 1
  const nElapsed = MISSILE_GetElapsedFrames113c(m, pMissile) | 0
  if (nElapsed < (m.u32((pMissilesTxt + 0x38) >>> 0) | 0) && smod32(nElapsed, nStep) === 0) {
    const tx = MISSILE_GetTargetX113c(m, pMissile) | 0
    const ty = MISSILE_GetTargetY113c(m, pMissile) | 0
    const diff = (tx - ty) | 0
    const newTx = ((diff - (diff >> 31)) >> 1) | 0
    const sum = (tx + ty) | 0
    const newTy = ((sum - (sum >> 31)) >> 1) | 0
    const destY = ((UNIT_GetPosY113c(m, pMissile) | 0) + newTy) | 0
    const destX = ((UNIT_GetPosX113c(m, pMissile) | 0) + newTx) | 0
    PATH_SetTargetPos113c(m, m.u32((pMissile + 0x2c) >>> 0), destX, destY)
    PATH_Compute113c(m, m.u32((pMissile + 0x2c) >>> 0), pMissile, 0)
    MISSILE_SetTargetX113c(m, pMissile, newTx)
    MISSILE_SetTargetY113c(m, pMissile, newTy)
  }
  return MISSILE_SrvDo01_LinearProjectile113c(m, pMissile, pGame, hooks) | 0
}

/**
 * `@va D2Game:0x6FC61980` (`MISSMODE_SrvDo05_FireWall`):
 * Stamps `0x40` collision pattern on `pMissile`'s room, updates cel animation frame (`+0x44`),
 * and forwards `hooks` into `MISSILE_SrvDo01_LinearProjectile113c` so hits invoke `SrvDmg[3]` + `killUnit`.
 */
export function MISSILE_SrvDo05_FireWallK3_113c(
  m: Memory113c,
  pGame: number,
  pMissile: number,
  hooks: K2GapMeleeDotHooks113c,
): number {
  if (pMissile === 0) {
    return MISSILE_SrvDo01_LinearProjectile113c(m, pMissile, pGame, hooks) | 0
  }
  const pMissilesTxt = MISSILES_GetTxtRecordFast113c(m, m.u32((pMissile + 0x04) >>> 0) | 0) >>> 0
  if (pMissilesTxt === 0) {
    return MISSILE_SrvDo01_LinearProjectile113c(m, pMissile, pGame, hooks) | 0
  }
  const nFrame = (m.u32((pMissile + 0x44) >>> 0) | 0) >> 8
  const y = UNIT_GetPosY113c(m, pMissile) | 0
  const x = UNIT_GetPosX113c(m, pMissile) | 0
  const nSizeX = UNITS_GetUnitSizeX113c(m, pMissile) | 0
  const pRoom = UNITS_GetRoom113c(m, pMissile) >>> 0
  COLLISION_SetMaskWithPattern113c(m, pRoom, x, y, nSizeX, 0x40)

  const uStart = m.u8((pMissilesTxt + 0x181) >>> 0)
  if (nFrame === ((uStart - 1) | 0)) {
    const uEnd = m.u8((pMissilesTxt + 0x182) >>> 0)
    const roll = SEED_RollLimitedFast113c(m, (pMissile + 0x20) >>> 0, (uEnd - uStart) | 0) | 0
    m.setU32((pMissile + 0x44) >>> 0, (((roll + nFrame) | 0) << 8) >>> 0)
    return MISSILE_SrvDo01_LinearProjectile113c(m, pMissile, pGame, hooks) | 0
  }
  const nRem = MISSILE_GetRemainingFrames113c(m, pMissile) | 0
  if (nRem === uStart) {
    m.setU32((pMissile + 0x44) >>> 0, (((uStart - 3) | 0) << 8) >>> 0)
    return MISSILE_SrvDo01_LinearProjectile113c(m, pMissile, pGame, hooks) | 0
  }
  if (nRem < uStart) {
    let nextFrame = (nFrame - 2) | 0
    if (nextFrame < 0) nextFrame = 0
    m.setU32((pMissile + 0x44) >>> 0, (nextFrame << 8) >>> 0)
  }
  return MISSILE_SrvDo01_LinearProjectile113c(m, pMissile, pGame, hooks) | 0
}

/**
 * `@va D2Game:0x6FC61850` (`MISSMODE_SrvDo06_FireWallMaker`):
 * Spawns trail `firewall` (`#69`) sub-missiles when `PATH_CheckFlag08_113c` triggers on subtile
 * transitions, and forwards `hooks` into `MISSILE_SrvDo01_LinearProjectile113c`.
 */
export function MISSILE_SrvDo06_FireWallMakerK3_113c(
  m: Memory113c,
  pGame: number,
  pMissile: number,
  hooks: K2GapMeleeDotHooks113c,
): number {
  if (pMissile === 0 || ((m.u32((pMissile + 0xc8) >>> 0) >>> 10) & 1) === 0) return 2
  const pOwner =
    SUNIT_GetServerUnit113c(
      m,
      pGame,
      m.u32((pMissile + 0x94) >>> 0) | 0,
      m.u32((pMissile + 0x98) >>> 0) | 0,
    ) >>> 0
  if (pOwner === 0) return 2
  const pMissilesTxt = MISSILES_GetTxtRecordFast113c(m, m.u32((pMissile + 0x04) >>> 0) | 0) >>> 0
  if (pMissilesTxt === 0 || sx16(m.u16((pMissilesTxt + 0x18) >>> 0)) < 0) return 2
  const pPath = m.u32((pMissile + 0x2c) >>> 0) >>> 0
  if (pPath === 0) return 2

  if (PATH_CheckFlag08_113c(m, pPath) !== 0) {
    const x = UNIT_GetPosX113c(m, pMissile) | 0
    const y = UNIT_GetPosY113c(m, pMissile) | 0
    const savedSp = k3SorcScratchSp
    const pParams = savedSp
    k3SorcScratchSp = (savedSp + 0x60) >>> 0
    try {
      m.fill(pParams, 0x5c, 0)
      m.setU32(pParams, 0x21)
      m.setU32((pParams + 0x04) >>> 0, pOwner)
      m.setU32((pParams + 0x14) >>> 0, x >>> 0)
      m.setU32((pParams + 0x18) >>> 0, y >>> 0)
      m.setU32((pParams + 0x2c) >>> 0, (MISSILE_GetSkill113c(m, pMissile) | 0) >>> 0)
      m.setU32((pParams + 0x30) >>> 0, (MISSILE_GetLevel113c(m, pMissile) | 0) >>> 0)
      m.setU32((pParams + 0x10) >>> 0, sx16(m.u16((pMissilesTxt + 0x18) >>> 0)) >>> 0)
      m.setU32((pParams + 0x1c) >>> 0, x >>> 0)
      m.setU32((pParams + 0x20) >>> 0, y >>> 0)
      MISSILE_CreateServerProjectile113c(m, pGame, pParams, hooks)
    } finally {
      k3SorcScratchSp = savedSp
    }
  }
  return MISSILE_SrvDo01_LinearProjectile113c(m, pMissile, pGame, hooks) | 0
}

/**
 * Builds the `[K3]` `K2GapMeleeDotHooks113c` dispatch table for missile `SrvDo` / `SrvHit` / `SrvDmg` / `killUnit`.
 */
export function MISSILE_BuildK3Hooks113c(
  onKillUnit: (m: Memory113c, pGame: number, pDefender: number, pAttacker: number) => void,
): K2GapMeleeDotHooks113c {
  const hooks: K2GapMeleeDotHooks113c = {
    srvDoMissile(m, wSrvDoIdx, _fnVa, pGame, pMissile) {
      if (wSrvDoIdx === 1) {
        return MISSILE_SrvDo01_FastcallThunk113c(m, pGame, pMissile, hooks)
      }
      if (wSrvDoIdx === 5) {
        return MISSILE_SrvDo05_FireWallK3_113c(m, pGame, pMissile, hooks)
      }
      if (wSrvDoIdx === 6) {
        return MISSILE_SrvDo06_FireWallMakerK3_113c(m, pGame, pMissile, hooks)
      }
      if (wSrvDoIdx === 15) {
        return MISSILE_SrvDo15_FrozenOrbK3_113c(m, pGame, pMissile, hooks)
      }
      if (wSrvDoIdx === 16) {
        return MISSILE_SrvDo16_SpiralPathK3_113c(m, pGame, pMissile, hooks)
      }
      return 1
    },
    srvHitMissile(m, wSrvHitIdx, _fnVa, pGame, pMissile, pTarget) {
      if (wSrvHitIdx === 1) {
        return MISSILE_SrvHit01_FireBallRadialK3_113c(m, pGame, pMissile, pTarget, hooks)
      }
      if (wSrvHitIdx === 12) {
        return MISSILES_SrvHit_ChainBounceProjectile_6FC5D020_113c(m, pGame, pMissile, pTarget)
      }
      if (wSrvHitIdx === 18) {
        return MISSMODE_SrvHit18_ShoutBattleOrdersCommandK3_113c(m, pGame, pMissile, pTarget)
      }
      if (wSrvHitIdx === 29) {
        return MISSILES_SrvDmg12B_Nova64RingOnExpire_6FC5C850_113c(m, pGame, pMissile, pTarget, hooks)
      }
      return MISSILE_DefaultSrvHitFlagsK3_113c(m, pMissile)
    },
    srvDmgMissile(m, wSrvDmgIdx, _fnVa, pGame, pMissile, pTarget, pDamage) {
      if (wSrvDmgIdx === 3) {
        MISSILES_SrvHit_RollKnockbackResult_6FC59670_113c(m, pGame, pMissile, pTarget, pDamage)
      } else if (wSrvDmgIdx === 7) {
        MISSMODE_SrvDmg07_WarcryShockWaveK3_113c(m, pGame, pMissile, pDamage)
      }
    },
    killUnit(m, pGame, pDefender, pAttacker) {
      onKillUnit(m, pGame, pDefender, pAttacker)
    },
  }
  return hooks
}
