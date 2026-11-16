/**
 * @file src/d2kern-113c/game/k3-p52-handlers-113c.ts
 * Clean-room 1:1 binary dispatch helpers for Milestone 34 (`[K3]`) longitudinal
 * golden replays (`p52-paladin-auras`, `p52-barbarian-warcries`, `p52-amazon-defense`).
 *
 * Strictly pure `src/d2kern-113c/` imports only (zero `src/common/` or `src/server/`).
 */

import { STATLIST_GetStatListFromUnitAndStateMemPort113c } from '../common/k0-d2common-memports.ts'
import { UNITS_GetLeftSkill113c } from '../common/quest-record.ts'
import { SKILLS_GetSkillIdFromSkill113c, SKILLS_GetUsedSkill113c } from '../common/skills.ts'
import { STATES_CheckState113c, STATLIST_GetStatValue113c } from '../common/statlist.ts'
import type { Memory113c } from '../mem/sparse-memory.ts'
import { SEED_RollLimitedRandomNumber113c } from './combat-a1c-113c.ts'
import { SKILLS_SetUsedSkill113c } from './monster-events.ts'
import { D2GAME_IAT_GDW_BITMASKS_VA_113C, SKILLS_GetRecordPtrFast113c } from './regpop-spawn-113c.ts'
import { EVENT_GetNextEventFrame113c } from './timer-wheel.ts'
import { AITHINK_CanPlayerSwitchToMode113c } from './town-runtime-gap-113c.ts'

/**
 * `@va D2Game:0x6FC97E00` (`checkUnitNextEventWithinFiveFrames`):
 * `EVENT_GetNextEventFrame(pUnit, 1) + 5 >= pGame->dwGameFrame`.
 */
function checkUnitNextEventWithinFiveFramesK3_113c(
  m: Memory113c,
  pUnit: number,
  pGame: number,
): number {
  const nextFrame = EVENT_GetNextEventFrame113c(m, pUnit, 1) | 0
  const gameFrame = m.u32((pGame + 0xa8) >>> 0) | 0
  return gameFrame <= ((nextFrame + 5) | 0) ? 1 : 0
}

/**
 * `@va D2Game:0x6FC98340` + `@va D2Game:0x6FC97FA0`:
 * Combined `AITHINK_CanPlayerSwitchToMode` + `AITHINK_CanPlayerStartSkillOrCast` guard
 * invoked by `PLAYER_StartModeOnUnit` (`0x6FC98430`) and `PLAYER_StartModeAtCoords` (`0x6FC98550`)
 * when `bForce == 0` (all C2S movement/attack/cast packets).
 *
 * Preserves `pUsedSkill` when `curMode === 1` (`0x6FC985DC: test eax, eax; je skip` skips
 * `SKILLS_SetUsedSkill` when `pSkill == 0`) and rolls `STATE_CONCENTRATION` (`0x2A = 42`)
 * `stat 0xA4` (`item_uninterruptable`) on `pPlayer->dwSeed (+0x20)` when `pUsedSkill` has
 * `Skills.txt` `Interrupt` (`byte +0x07 & 0x80`).
 */
export function PLAYER_CanStartModeAndSkillK3_113c(
  m: Memory113c,
  pPlayer: number,
  pGame: number,
  nTargetMode: number,
  pTargetSkill: number,
  onResetNeutralWhenMode1?: () => void,
): number {
  if (AITHINK_CanPlayerSwitchToMode113c(m, pPlayer, pGame, nTargetMode) === 0) {
    return 0
  }
  // 0x6FC97FA0: AITHINK_CanPlayerStartSkillOrCast(pGame, pPlayer, nTargetMode, bCheckSkill=1, pTargetSkill)
  if (STATES_CheckState113c(m, pPlayer, 0x36) !== 0) {
    return 0
  }
  if (pPlayer === 0) {
    return 0
  }
  const curMode = m.u32((pPlayer + 0x10) >>> 0)
  if (curMode === 0 || curMode === 0x11) {
    return 0
  }
  if (nTargetMode === 0) {
    return 1
  }
  const pUsedSkill = SKILLS_GetUsedSkill113c(m, pPlayer) >>> 0
  if (pUsedSkill === 0) {
    return 1
  }
  const skillId = SKILLS_GetSkillIdFromSkill113c(m, pUsedSkill, 0, 0xba)
  const pSkillsTxt = SKILLS_GetRecordPtrFast113c(m, skillId)
  if (pSkillsTxt === 0) {
    return 1
  }
  if ((pTargetSkill >>> 0) === pUsedSkill) {
    const wSrvDoFunc = m.u16((pSkillsTxt + 0x2e) >>> 0)
    if (wSrvDoFunc === 0x43 || wSrvDoFunc === 0x4c) {
      return 1
    }
  }
  const gdwBitMasks = m.u32(D2GAME_IAT_GDW_BITMASKS_VA_113C)
  const mask7 = gdwBitMasks !== 0 ? m.u8((gdwBitMasks + 0x1c) >>> 0) : 0x80
  if ((m.u8((pSkillsTxt + 7) >>> 0) & mask7) !== 0) {
    let bUninterruptable = 0
    if (STATES_CheckState113c(m, pPlayer, 0x2a) !== 0) {
      const pStatList = STATLIST_GetStatListFromUnitAndStateMemPort113c(m, pPlayer, 0x2a)
      const concPct = STATLIST_GetStatValue113c(m, pStatList, 0xa4, 0) | 0
      const roll = SEED_RollLimitedRandomNumber113c(m, (pPlayer + 0x20) >>> 0, 100) | 0
      if (roll < concPct) {
        bUninterruptable = 1
      }
    }
    if (bUninterruptable === 0) {
      if (STATES_CheckState113c(m, pPlayer, 0x0f) === 0) {
        return 1
      }
    }
    if (m.u32((pPlayer + 0x10) >>> 0) !== 1) {
      return 0
    }
    if (onResetNeutralWhenMode1 !== undefined) {
      onResetNeutralWhenMode1()
    }
    return 1
  }
  if (m.u32((pPlayer + 0x10) >>> 0) === 1) {
    if (onResetNeutralWhenMode1 !== undefined) {
      onResetNeutralWhenMode1()
    }
    return 1
  }
  if (
    nTargetMode === 7 ||
    nTargetMode === 8 ||
    nTargetMode === 10 ||
    nTargetMode === 11 ||
    nTargetMode === 13 ||
    nTargetMode === 18
  ) {
    return checkUnitNextEventWithinFiveFramesK3_113c(m, pPlayer, pGame) !== 0 ? 1 : 0
  }
  return 0
}

/**
 * `@va D2Game:0x6FC9852B`: bind left-hand skill into `pPlayer->pSkills->pUsedSkill`
 * when entering `PLRMODE_ATTACK1` via `0x06` or queued melee arrival.
 */
export function PLAYER_BindLeftSkillAsUsedK3_113c(m: Memory113c, pPlayer: number): void {
  const pLeftSkill = UNITS_GetLeftSkill113c(m, pPlayer) >>> 0
  if (pLeftSkill !== 0) {
    SKILLS_SetUsedSkill113c(m, pPlayer, pLeftSkill)
  }
}
