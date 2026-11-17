/**
 * @file src/d2kern-113c/game/k3-p52-handlers-113c.ts
 * Clean-room 1:1 binary dispatch helpers for Milestone 34 (`[K3]`) longitudinal
 * golden replays (`p52-paladin-auras`, `p52-barbarian-warcries`, `p52-amazon-defense`).
 *
 * Strictly pure `src/d2kern-113c/` imports only (zero legacy common or host imports).
 */

import {
  DUNGEON_CheckRoomIsTownMemPort113c,
  STATLIST_GetStatListFromUnitAndStateMemPort113c,
} from '../common/k0-d2common-memports.ts'
import { MISSILE_GetLevel113c, MISSILE_GetSkill113c } from '../common/missile.ts'
import { PATH_GetPosX113c, PATH_GetPosY113c, PATH_SetTargetUnit113c } from '../common/path.ts'
import { UNITS_GetLeftSkill113c, UNITS_GetRightSkill113c } from '../common/quest-record.ts'
import {
  SKILLS_EvalCalcByOffset113c,
  SKILLS_GetFirstSkillFromSkillList113c,
  SKILLS_GetNextSkill113c,
  SKILLS_GetPassiveState113c,
  SKILLS_GetSkillById113c,
  SKILLS_GetSkillIdFromSkill113c,
  SKILLS_GetSkillSlotIndex113c,
  SKILLS_GetSkillUseFailReason113c,
  SKILLS_GetUsedSkill113c,
  SKILLS_RefreshPassiveAuraSkills113c,
} from '../common/skills.ts'
import {
  STATES_ApplyMonSkillIconToUnit113c,
  STATES_CheckState113c,
  STATES_ClearGfxStateFlag113c,
  STATES_ToggleGfxStateFlag113c,
  STATLIST_AllocList113c,
  STATLIST_ExpireStateListsOnModeChange113c,
  STATLIST_GetStatValue113c,
  STATLIST_GetUnitStat113c,
  STATLIST_MergeStatLists113c,
  STATLIST_SetExpireFrameEx113c,
  STATLIST_SetStat113c,
  STATLIST_SetStatRemoveProc113c,
  STATLIST_SetState113c,
  STATLIST_SetUnitStat113c,
} from '../common/statlist.ts'
import {
  UNITS_GetRoom113c,
  UNITS_SetUnitAnimMode113c,
  UNITS_UpdateAnimFrame113c,
} from '../common/unit.ts'
import { D2GameStrc, D2SkillStrc, D2UnitStrc } from '../mem/layout.generated.ts'
import type { Memory113c } from '../mem/sparse-memory.ts'
import { SEED_RollLimitedRandomNumber113c } from './combat-a1c-113c.ts'
import { SUNIT_GetServerUnit113c } from './game-strc.ts'
import {
  PLAYER_Event0C_ExpireTimedStats113c,
  SUNIT_AreUnitsInSamePartyOrAligned113c,
} from './k2-gap-itemdef-113c.ts'
import {
  MISSILES_GetTxtRecordFast113c,
  MISSILE_SpawnNova64Directions113c,
  MONSTER_Event12_ExpireTimedStats113c,
  SKILLS_ResolveChargedSrvMissileId113c,
  type K2GapMeleeDotHooks113c,
} from './k2-gap-melee-dot-113c.ts'
import {
  MONSTER_ClearModeEvents113c,
  SKILLS_SetUsedSkill113c,
} from './monster-events.ts'
import {
  D2GAME_IAT_GDW_BITMASKS_VA_113C,
  D2GAME_IAT_SGPT_DATATABLES_VA_113C,
  SKILLS_GetRecordPtrFast113c,
} from './regpop-spawn-113c.ts'
import { EVENT_GetNextEventFrame113c, EVENT_SetEventFull113c } from './timer-wheel.ts'
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

/**
 * `@va D2Game:0x6FCFD1CE..0x6FCFD26C` -> `@va D2Game:0x6FC98430` -> `@va D2Game:0x6FC987C0`:
 * Start `PLRMODE_SPECIAL1` (`13`) on player defender when `wResultFlags & 0x80` (`STATE_DODGE = 65`)
 * or `wResultFlags & 0x100` (`STATE_AVOID = 66`) triggered in `SUNITDMG_ExecuteDamageResult`.
 */
export function PLAYER_TryStartDodgeOrAvoidModeK3_113c(
  m: Memory113c,
  pGame: number,
  pDefender: number,
  pAttacker: number,
  wResultFlags: number,
  scheduleAnimEvents: (m: Memory113c, pGame: number, pPlayer: number) => void,
  syncPathUnit?: (mode: number, flags: number) => void,
): number {
  const stateId = (wResultFlags & 0x80) !== 0 ? 0x41 : (wResultFlags & 0x100) !== 0 ? 0x42 : 0
  if (stateId === 0 || pGame === 0 || pDefender === 0) return 0
  const pStatList = STATLIST_GetStatListFromUnitAndStateMemPort113c(m, pDefender, stateId)
  if (pStatList === 0) return 0
  const nSkillId = STATLIST_GetStatValue113c(m, pStatList, 0x15e, 0) | 0
  const pSkill = SKILLS_GetSkillById113c(m, pDefender, nSkillId, -1) >>> 0
  if (pSkill === 0) return 0
  m.set(pSkill, D2SkillStrc.dwFlags, (m.get(pSkill, D2SkillStrc.dwFlags) | 4) >>> 0)

  if (PLAYER_CanStartModeAndSkillK3_113c(m, pDefender, pGame, 13, pSkill) === 0) {
    return 0
  }
  const pPlayerData = m.get(pDefender, D2UnitStrc.pUnitData) >>> 0
  if (pPlayerData !== 0) {
    m.setU32((pPlayerData + 0x150) >>> 0, 0)
    m.setU32((pPlayerData + 0x154) >>> 0, 0)
  }
  SKILLS_SetUsedSkill113c(m, pDefender, pSkill)

  const pPath = m.get(pDefender, D2UnitStrc.pPath) >>> 0
  if (pPath !== 0) {
    const isDeadMonsterCorpse =
      pAttacker !== 0 &&
      m.get(pAttacker, D2UnitStrc.dwUnitType) === 1 &&
      m.get(pAttacker, D2UnitStrc.dwAnimMode) === 12
    PATH_SetTargetUnit113c(m, pPath, isDeadMonsterCorpse ? 0 : pAttacker)
  }
  if (m.get(pDefender, D2UnitStrc.dwAnimMode) !== 13) {
    STATLIST_ExpireStateListsOnModeChange113c(m, pDefender, 0)
  }
  m.set(pDefender, D2UnitStrc.dwAnimMode, 13)
  UNITS_SetUnitAnimMode113c(m, pDefender, 0, 0)
  UNITS_UpdateAnimFrame113c(m, pDefender)
  MONSTER_ClearModeEvents113c(m, pGame, pDefender)
  scheduleAnimEvents(m, pGame, pDefender)
  const nextFlags = (m.get(pDefender, D2UnitStrc.dwFlags) & ~0x40) >>> 0
  m.set(pDefender, D2UnitStrc.dwFlags, nextFlags)
  if (syncPathUnit !== undefined) {
    syncPathUnit(13, nextFlags)
  }
  return 1
}

/**
 * `@va D2Game:0x6FCBE370` (`SKILLS_RefreshPassiveSkillsAndIconsOnUnit`):
 * Refreshes passive state flags and monster skill icons across `pUnit->pSkills`.
 */
function refreshPassiveSkillsAndIconsK3_113c(m: Memory113c, pUnit: number): void {
  const pSkillList = m.u32((pUnit + 0xa8) >>> 0) >>> 0
  if (pSkillList === 0) return
  let pSkill = SKILLS_GetFirstSkillFromSkillList113c(m, pSkillList) >>> 0
  while (pSkill !== 0) {
    const nSkillId = SKILLS_GetSkillIdFromSkill113c(m, pSkill, 0x6fd1b980, 0x1153) | 0
    const nState = SKILLS_GetPassiveState113c(m, nSkillId) | 0
    if (nState > 0) {
      STATES_ToggleGfxStateFlag113c(m, pUnit >>> 0, nState, 1)
      STATES_ApplyMonSkillIconToUnit113c(m, pUnit >>> 0, nSkillId)
    }
    pSkill = SKILLS_GetNextSkill113c(m, pSkill) >>> 0
  }
}

/**
 * `@va D2Game:0x6FCF957D..0x6FCF9635`: proportional `fild/fdivp/fmulp/__ftol` scaling of current
 * `hitpoints (6)`, `mana (8)`, and `stamina (10)` when `maxhp (7)`, `maxmana (9)`, or `maxstamina (11)` changes.
 */
function scaleResourceOnMaxChangedK3_113c(
  m: Memory113c,
  pUnit: number,
  curStatId: number,
  oldMax: number,
  newMax: number,
): void {
  if (newMax === oldMax || oldMax <= 0) return
  const curVal = STATLIST_GetUnitStat113c(m, pUnit, curStatId, 0) | 0
  if (curVal <= 0) return
  const denom = oldMax > 0x100 ? oldMax : 0x100
  let scaled = Math.trunc((curVal / denom) * newMax)
  if (scaled <= 1) scaled = 1
  if (scaled >= newMax) scaled = newMax
  STATLIST_SetUnitStat113c(m, pUnit, curStatId, scaled, 0)
  if (curStatId === 6 && m.u32(pUnit >>> 0) === 1) {
    const classId = m.u32((pUnit + 0x04) >>> 0) | 0
    const pSgptPtr = m.u32(D2GAME_IAT_SGPT_DATATABLES_VA_113C) >>> 0
    const pDataTables = pSgptPtr !== 0 ? (m.u32(pSgptPtr) >>> 0) : 0
    if (classId >= 0 && pDataTables !== 0 && classId < (m.u32((pDataTables + 0xa80) >>> 0) | 0)) {
      const pMonTxt = (m.u32((pDataTables + 0xa78) >>> 0) + Math.imul(classId, 0x1a8)) >>> 0
      const nLifeRegen = m.u32((pMonTxt + 0x1a0) >>> 0) | 0
      if (nLifeRegen !== 0) {
        const regenVal = (Math.imul(newMax >> 8, nLifeRegen) >> 4) | 0
        STATLIST_SetUnitStat113c(m, pUnit, 0x4a, regenVal, 0)
      }
    }
  }
}

function syncDerivedMaxAndSkillStatsK3_113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  oldMaxHp: number,
  oldMaxMana: number,
  oldMaxStam: number,
  oldAllSkills: number,
): void {
  if (pGame === 0 || pUnit === 0) return
  const newMaxHp = STATLIST_GetUnitStat113c(m, pUnit, 7, 0) | 0
  if (newMaxHp !== oldMaxHp) {
    scaleResourceOnMaxChangedK3_113c(m, pUnit, 6, oldMaxHp, newMaxHp)
  }
  const newMaxMana = STATLIST_GetUnitStat113c(m, pUnit, 9, 0) | 0
  if (newMaxMana !== oldMaxMana) {
    scaleResourceOnMaxChangedK3_113c(m, pUnit, 8, oldMaxMana, newMaxMana)
  }
  const newMaxStam = STATLIST_GetUnitStat113c(m, pUnit, 11, 0) | 0
  if (newMaxStam !== oldMaxStam) {
    scaleResourceOnMaxChangedK3_113c(m, pUnit, 10, oldMaxStam, newMaxStam)
  }
  const newAllSkills = STATLIST_GetUnitStat113c(m, pUnit, 127, 0) | 0
  if (newAllSkills !== oldAllSkills) {
    refreshPassiveSkillsAndIconsK3_113c(m, pUnit)
    SKILLS_RefreshPassiveAuraSkills113c(m, pUnit)
  }
}

/**
 * `@va D2Game:0x6FC648E0` (`SKILLS_ApplySkillAuraStatCalcs`):
 * Evaluates `aurastat1..6 (+0x54)` / `aurastatcalc1..6 (+0x68)` and writes non-zero stats into `pStatList`.
 */
function applySkillAuraStatCalcsK3_113c(
  m: Memory113c,
  pSkillsTxt: number,
  pCasterUnit: number,
  pStatList: number,
  nSkillId: number,
  nSkillLevel: number,
): void {
  if (pCasterUnit === 0 || pStatList === 0 || pSkillsTxt === 0) return
  const pSgptPtr = m.u32(D2GAME_IAT_SGPT_DATATABLES_VA_113C) >>> 0
  const pDataTables = pSgptPtr !== 0 ? (m.u32(pSgptPtr) >>> 0) : 0
  const nIscCount = pDataTables !== 0 ? (m.u32((pDataTables + 0xbd4) >>> 0) | 0) : 0
  for (let i = 0; i < 6; i++) {
    const statId = (m.u16((pSkillsTxt + 0x54 + i * 2) >>> 0) << 16) >> 16
    if (statId < 0 || statId >= nIscCount) continue
    const dwCalc = m.u32((pSkillsTxt + 0x68 + i * 4) >>> 0) >>> 0
    const val = SKILLS_EvalCalcByOffset113c(m, pCasterUnit, dwCalc, nSkillId | 0, nSkillLevel | 0) | 0
    if (val === 0) continue
    STATLIST_SetStat113c(m, pStatList, statId, val, 0)
    if (statId === 0x44) {
      STATLIST_SetStat113c(m, pStatList, 0x45, val, 0)
    }
  }
  UNITS_SetUnitAnimMode113c(m, pCasterUnit, 0, 0xf8)
}

/**
 * `@va D2Game:0x6FC49240` (`SKILLS_ApplyTimedSkillAuraToTarget`) + `@va D2Game:0x6FCF9470`:
 * Applies a timed skill buff (`Battle Orders` `#149` state `32`, `Battle Command` `#155` state `51`,
 * `Shout` `#138` state `26`) to `pTargetUnit` and fires `D2StatListEx.fpStatChanged` (`0x6FCF9470`)
 * when `maxhp (7)`, `maxmana (9)`, `maxstamina (11)`, or `item_allskills (127)` changes.
 */
export function SKILLS_ApplyTimedSkillAuraWithStatSyncK3_113c(
  m: Memory113c,
  pTargetUnit: number,
  pGame: number,
  pCasterUnit: number,
  nSkillId: number,
  nSkillLevel: number,
): number {
  const skId = nSkillId | 0
  if (pTargetUnit === 0 || pGame === 0 || skId < 0) return 0
  const pSgptPtr = m.u32(D2GAME_IAT_SGPT_DATATABLES_VA_113C) >>> 0
  const pDataTables = pSgptPtr !== 0 ? (m.u32(pSgptPtr) >>> 0) : 0
  if (pDataTables === 0 || skId >= (m.u32((pDataTables + 0xba0) >>> 0) | 0)) return 0
  const pSkillsTxt = (m.u32((pDataTables + 0xb98) >>> 0) + Math.imul(skId, 0x23c)) >>> 0
  if (pSkillsTxt === 0) return 0

  const nAuraState = (m.u16((pSkillsTxt + 0x80) >>> 0) << 16) >> 16
  if (nAuraState < 0 || nAuraState >= (m.u32((pDataTables + 0xc4) >>> 0) | 0)) return 0

  const oldMaxHp = STATLIST_GetUnitStat113c(m, pTargetUnit, 7, 0) | 0
  const oldMaxMana = STATLIST_GetUnitStat113c(m, pTargetUnit, 9, 0) | 0
  const oldMaxStam = STATLIST_GetUnitStat113c(m, pTargetUnit, 11, 0) | 0
  const oldAllSkills = STATLIST_GetUnitStat113c(m, pTargetUnit, 127, 0) | 0

  const dwAuraLenCalc = m.u32((pSkillsTxt + 0x60) >>> 0) >>> 0
  const nDuration = SKILLS_EvalCalcByOffset113c(
    m,
    pCasterUnit >>> 0,
    dwAuraLenCalc,
    skId,
    nSkillLevel | 0,
  )
  const nExpireFrame = ((nDuration | 0) + (m.u32(((pGame >>> 0) + 0xa8) >>> 0) | 0)) >>> 0
  const target = pTargetUnit >>> 0
  let pStatList = STATLIST_GetStatListFromUnitAndStateMemPort113c(m, target, nAuraState)
  if (pStatList === 0) {
    let ownerType = 6
    let ownerId = 0xffffffff
    if ((pCasterUnit >>> 0) !== 0) {
      ownerId = m.u32(((pCasterUnit >>> 0) + 0x0c) >>> 0) >>> 0
      ownerType = m.u32(pCasterUnit >>> 0) >>> 0
    }
    pStatList = STATLIST_AllocList113c(m, 2, ownerType, ownerId, 0, nExpireFrame)
    if (pStatList === 0) return 0
    STATLIST_SetState113c(m, pStatList, nAuraState)
    STATLIST_SetStatRemoveProc113c(m, pStatList, 0x6fcbf7a0)
    STATLIST_MergeStatLists113c(m, target, pStatList, 1)
    STATES_ToggleGfxStateFlag113c(m, target, nAuraState, 1)
  }
  STATES_ClearGfxStateFlag113c(m, target, nAuraState, 1)
  STATLIST_SetExpireFrameEx113c(m, pStatList, nExpireFrame)
  EVENT_SetEventFull113c(m, pGame >>> 0, target, 0x0c, nExpireFrame, 0, 0, 0)
  applySkillAuraStatCalcsK3_113c(
    m,
    pSkillsTxt,
    pCasterUnit >>> 0,
    pStatList,
    skId,
    nSkillLevel | 0,
  )
  SKILLS_RefreshPassiveAuraSkills113c(m, target)
  syncDerivedMaxAndSkillStatsK3_113c(
    m,
    pGame,
    target,
    oldMaxHp,
    oldMaxMana,
    oldMaxStam,
    oldAllSkills,
  )
  return 1
}

/**
 * `@va D2Game:0x6FC97820` + `@va D2Game:0x6FCF9470`:
 * Runs `PLAYER_Event0C_ExpireTimedStats113c` and triggers `0x6FCF9470` resource/skill scaling
 * if any expired timed state modified `maxhp`, `maxmana`, `maxstamina`, or `item_allskills`.
 */
export function PLAYER_Event0C_ExpireTimedStatsWithSyncK3_113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  arg14: number,
  arg18: number,
  hooks?: K2GapMeleeDotHooks113c,
): void {
  if (pUnit === 0 || pGame === 0) return
  const oldMaxHp = STATLIST_GetUnitStat113c(m, pUnit, 7, 0) | 0
  const oldMaxMana = STATLIST_GetUnitStat113c(m, pUnit, 9, 0) | 0
  const oldMaxStam = STATLIST_GetUnitStat113c(m, pUnit, 11, 0) | 0
  const oldAllSkills = STATLIST_GetUnitStat113c(m, pUnit, 127, 0) | 0
  MONSTER_Event12_ExpireTimedStats113c(m, pGame, pUnit, arg14, arg18, hooks)
  PLAYER_Event0C_ExpireTimedStats113c(m, pGame, pUnit, arg14, arg18)
  syncDerivedMaxAndSkillStatsK3_113c(
    m,
    pGame,
    pUnit,
    oldMaxHp,
    oldMaxMana,
    oldMaxStam,
    oldAllSkills,
  )
}

/**
 * `@va D2Game:0x6FC49720` (`SKILLS_SrvDo068_BasicShout`, `wSrvDoFunc = 68`):
 * Sets `UNITFLAG_SKSRVDO (0x40)` on `pUnit`, resolves `nMissileId` via `0x6FCB1340` against
 * `sgptDataTables->nMissilesTxtRecordCount (+0xB6C)`, spawns 64 radial missiles (`0x6FCC2800`),
 * applies self timed buff (`0x6FC49240`), and unconditionally returns `1` (`0x6FC497A1`).
 */
export function SKILLS_SrvDo068_BasicShoutK3_113c(
  m: Memory113c,
  pGame: number,
  pUnit: number,
  nSkillId: number,
  nSkillLevel: number,
  hooks?: K2GapMeleeDotHooks113c,
): number {
  if (pUnit !== 0) {
    m.setU32((pUnit + 0xc4) >>> 0, (m.u32((pUnit + 0xc4) >>> 0) | 0x40) >>> 0)
  }
  if ((nSkillId | 0) < 0) return 0
  const pSkillsTxt = SKILLS_GetRecordPtrFast113c(m, nSkillId)
  if (pSkillsTxt === 0) return 0

  const nMissileId = SKILLS_ResolveChargedSrvMissileId113c(m, nSkillId, pUnit) | 0
  const pSgptPtr = m.u32(D2GAME_IAT_SGPT_DATATABLES_VA_113C) >>> 0
  const pDataTables = pSgptPtr !== 0 ? (m.u32(pSgptPtr) >>> 0) : 0
  if (nMissileId < 0 || pDataTables === 0 || nMissileId >= (m.u32((pDataTables + 0xb6c) >>> 0) | 0)) {
    return 0
  }

  MISSILE_SpawnNova64Directions113c(m, pUnit, 0, pGame, pUnit, nMissileId, nSkillId, nSkillLevel, hooks)
  SKILLS_ApplyTimedSkillAuraWithStatSyncK3_113c(m, pUnit, pGame, pUnit, nSkillId, nSkillLevel)
  return 1
}

/**
 * `@va D2Game:0x6FC5EA60` (`MISSMODE_SrvHit18_Shout_BattleCommand_BattleOrders`, `wSrvHit = 18`):
 * Returns `1` (destroy) if `pMissile` has no live server owner; otherwise applies timed buff
 * `0x6FC49240` onto aligned `pTargetUnit` and returns `0` (`0x6FC5EACF: xor eax, eax`) so the
 * shout/battleorders/battlecommand ring pierces allies until range expiry.
 */
export function MISSMODE_SrvHit18_ShoutBattleOrdersCommandK3_113c(
  m: Memory113c,
  pGame: number,
  pMissile: number,
  pTargetUnit: number,
): number {
  if (pMissile === 0) return 1
  if (((m.u32((pMissile + 0xc8) >>> 0) >>> 10) & 1) === 0) return 1
  const pOwner = SUNIT_GetServerUnit113c(
    m,
    pGame,
    m.u32((pMissile + 0x94) >>> 0),
    m.u32((pMissile + 0x98) >>> 0),
  )
  if (pOwner === 0) return 1
  if (pTargetUnit !== 0 && SUNIT_AreUnitsInSamePartyOrAligned113c(m, pTargetUnit, pOwner) !== 0) {
    const nSkillLevel = MISSILE_GetLevel113c(m, pMissile) | 0
    const nSkillId = MISSILE_GetSkill113c(m, pMissile) | 0
    SKILLS_ApplyTimedSkillAuraWithStatSyncK3_113c(m, pTargetUnit, pGame, pOwner, nSkillId, nSkillLevel)
  }
  return 0
}

/**
 * `@va D2Game:0x6FC59600` (`MISSMODE_SrvDmg07_Warcry_ShockWave`, `wSrvDmg = 7`):
 * Populates `pDamage->dwStunLen (+0x44)` and `pDamage->dwHitClass (+0x60 = 0x60)` for `War Cry` (`#154`).
 */
export function MISSMODE_SrvDmg07_WarcryShockWaveK3_113c(
  m: Memory113c,
  _pGame: number,
  pMissile: number,
  pDamage: number,
): void {
  const missile = pMissile >>> 0
  if (missile === 0 || pDamage === 0) return
  const pRec = MISSILES_GetTxtRecordFast113c(m, m.u32((missile + 0x04) >>> 0) | 0)
  if (pRec === 0) return
  const nSkillId = MISSILE_GetSkill113c(m, missile) | 0
  const nLevel = MISSILE_GetLevel113c(m, missile) | 0
  let nRange = m.u32((pRec + 0x78) >>> 0) | 0
  if (nRange <= 0 && nSkillId >= 0 && nLevel > 0) {
    const pSkillsTxt = SKILLS_GetRecordPtrFast113c(m, nSkillId)
    if (pSkillsTxt !== 0) {
      nRange =
        ((m.u32((pSkillsTxt + 0x148) >>> 0) | 0) +
          Math.imul((nLevel - 1) | 0, m.u32((pSkillsTxt + 0x14c) >>> 0) | 0)) |
        0
    }
  }
  const out = pDamage >>> 0
  m.setU32((out + 0x44) >>> 0, nRange >>> 0)
  m.setU32((out + 0x60) >>> 0, 0x60)
}

/**
 * Default `hitFlags` preservation for `MISSILE_ProcessTargetCollisionHit113c` (`0x6FC5EDE0`)
 * when `hooks.srvHitMissile` is installed and `wSrvHitIdx` is not a custom-dispatched K3 entry.
 */
export function MISSILE_DefaultSrvHitFlagsK3_113c(m: Memory113c, pMissile: number): number {
  if (pMissile === 0) return 2
  const pMisTxt = MISSILES_GetTxtRecordFast113c(m, m.u32((pMissile + 0x04) >>> 0) | 0)
  if (pMisTxt === 0) return 2
  const gdwBitMasks = m.u32(D2GAME_IAT_GDW_BITMASKS_VA_113C) >>> 0
  const mask2 = gdwBitMasks !== 0 ? m.u8((gdwBitMasks + 0x08) >>> 0) : 0x04
  let hitFlags = (m.u8((pMisTxt + 0x04) >>> 0) & mask2) !== 0 ? 0 : 2
  if (m.u8((pMisTxt + 0x186) >>> 0) !== 0) {
    hitFlags |= 1
  }
  return hitFlags
}

/**
 * `@va D2Game:0x6FCEE520` -> `0x6FCEBF50` -> `0x6FCEB690` -> `0x6FCEDF30` -> `@va D2Common:0x6FDA2340`:
 * Validates C2S `0x0C` (`RightSkillOnLocation`) 50-subtile target distance, town restriction,
 * `SKILLS_GetSkillUseFailReason113c` (`D2Common.#10787` OOM/charges/skilldelay abort, e.g. `F1070`),
 * `SKILLS_GetSkillSlotIndex113c` (`D2Common.#10952`), and `PLAYER_CanStartModeAndSkillK3_113c`.
 */
export function PLAYER_ValidatePacket0CLocationCastK3_113c(
  m: Memory113c,
  pGame: number,
  pPlayer: number,
  nX: number,
  nY: number,
): { readonly pSkill: number; readonly nMode: number } | null {
  if (pGame === 0 || pPlayer === 0) return null
  const pPlayerData = m.get(pPlayer, D2UnitStrc.pUnitData) >>> 0
  if (pPlayerData === 0) return null

  const pPath = m.get(pPlayer, D2UnitStrc.pPath) >>> 0
  const px = pPath !== 0 ? (PATH_GetPosX113c(m, pPath) | 0) : 0
  const py = pPath !== 0 ? (PATH_GetPosY113c(m, pPath) | 0) : 0
  if (Math.abs(px - (nX | 0)) > 50 || Math.abs(py - (nY | 0)) > 50) {
    return null
  }
  m.setU32((pPlayerData + 0x168) >>> 0, m.get(pGame, D2GameStrc.dwGameFrame) >>> 0)

  const pRightSkill = UNITS_GetRightSkill113c(m, pPlayer) >>> 0
  if (pRightSkill === 0) return null

  const nextCastCnt = ((STATLIST_GetUnitStat113c(m, pPlayer, 0x148, 0) | 0) + 1) | 0
  STATLIST_SetUnitStat113c(m, pPlayer, 0x148, nextCastCnt, 0)

  const curMode = m.get(pPlayer, D2UnitStrc.dwAnimMode) >>> 0
  if (curMode === 0 || curMode === 0x11) return null

  let pSkill = pRightSkill
  let failReason = SKILLS_GetSkillUseFailReason113c(m, pPlayer, pSkill) | 0
  const pSkillsTxt = m.u32(pSkill) >>> 0
  if (pSkillsTxt === 0) return null

  const pRoom = UNITS_GetRoom113c(m, pPlayer) >>> 0
  if (pRoom !== 0 && DUNGEON_CheckRoomIsTownMemPort113c(m, pRoom) !== 0) {
    const skillId = SKILLS_GetSkillIdFromSkill113c(m, pSkill, 0, 0xba) | 0
    if (skillId > 0 && (m.u8((pSkillsTxt + 0x06) >>> 0) & 0x20) === 0) {
      return null
    }
  }

  if (failReason > 0 && (failReason <= 2 || failReason === 4)) {
    const gdwBitMasks = m.u32(D2GAME_IAT_GDW_BITMASKS_VA_113C) >>> 0
    const mask4 = gdwBitMasks !== 0 ? m.u8((gdwBitMasks + 0x10) >>> 0) : 0x10
    if ((m.u8((pSkillsTxt + 0x07) >>> 0) & mask4) !== 0) {
      pSkill = SKILLS_GetSkillById113c(m, pPlayer, 0, -1) >>> 0
      if (pSkill === 0) return null
      failReason = SKILLS_GetSkillUseFailReason113c(m, pPlayer, pSkill) | 0
    }
  }

  const slotMode = SKILLS_GetSkillSlotIndex113c(m, pPlayer, pSkill) | 0
  if (slotMode === 0 || failReason !== 0) {
    return null
  }

  const targetMode = slotMode === 18 ? 18 : slotMode === 7 || slotMode === 8 ? slotMode : 10
  if (PLAYER_CanStartModeAndSkillK3_113c(m, pPlayer, pGame, targetMode, pSkill) === 0) {
    return null
  }
  return { pSkill, nMode: targetMode }
}
