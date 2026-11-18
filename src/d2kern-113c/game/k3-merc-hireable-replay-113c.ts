/**
 * @file src/d2kern-113c/game/k3-merc-hireable-replay-113c.ts
 * Milestone 34 ([K3]) Hireling / Mercenary longitudinal replay bridge (`p52-paladin-merc-aura`):
 * - Hydrates unloaded snapshot `D2PlayerDataStrc` breadcrumb tail, owner `D2PetListStrc` slot `7`,
 *   and `Hireling.txt` skills on boot.
 * - Routes every hireling AI think, move, skill cast, attack step, velocity override, breadcrumb,
 *   and kill XP split through its single canonical manifest-bound `tsSymbol` function.
 *
 * Strictly pure `src/d2kern-113c/` imports only.
 */

import { UNITS_GetPlayerData113c } from '../common/composit.ts'
import { MONSTER_GetMissileIdForAnimMode113c } from '../common/drlg/drlg-ver.ts'
import { imul32, sdiv32 } from '../common/int-math.ts'
import { SKILLS_GetUsedSkillMemPort113c } from '../common/k0-d2common-memports.ts'
import { PATH_GetTargetUnit113c } from '../common/path.ts'
import {
  SKILLS_AllocSkillList113c,
  SKILLS_GetSkillById113c,
  SKILLS_GetSkillIdFromSkill113c,
  SKILLS_SetSkillLevelOnUnit113c,
  SKILLS_SetSkillSlotIndex113c,
} from '../common/skills.ts'
import { STATLIST_GetUnitStat113c } from '../common/statlist.ts'
import { UNIT_MONSTER, UNIT_PLAYER } from '../common/unit.ts'
import {
  D2AiGeneralStrc,
  D2MonsterDataStrc,
  D2UnitStrc,
} from '../mem/layout.generated.ts'
import type { Memory113c, SparseMemory113c } from '../mem/sparse-memory.ts'
import { DATATBLS_GetHirelingTxtRecordFromIdAndLevel113c } from '../tables/monster-tbls-113c.ts'
import { SKILLS_StartUsedSkill113c } from './a1c-post150-f786-f1040-113c.ts'
import {
  MONSTER_AdvanceAttackOrSkillStep113c,
  MONSTER_StartAttackOrCast113c,
} from './ai-fallen-113c.ts'
import { MONSTER_GetHirelingLevelBonusFactor113c } from './boot-init-gap-a-113c.ts'
import { SUNIT_GetServerUnit113c } from './game-strc.ts'
import { bindK2KernelGlobals113c } from './k2-d2tv-evaluators-113c.ts'
import type { K2GapMeleeDotHooks113c } from './k2-gap-melee-dot-113c.ts'
import {
  type MonsterSliceWorldLike113c,
  SUNITDMG_AddPlayerExperienceAndCheckLevelUp113c,
  SUNITDMG_ResolveAttackerPlayer113c,
} from './k2-real-s2c-combat-113c.ts'
import { AI_ThinkMercenaryMain_6FC3DD40_113c } from './k2-w12b1-113c.ts'
import { SKILLS_SrvSt32_EnsureWeaponOrQuiverOrStartCast_6FC6C840_113c } from './k2-w5b1-113c.ts'
import { SKILLS_CreateDirectionalProjectileWithToHitAndAmmo_6FCC28F0_113c } from './k2-w6b2-113c.ts'
import { HIRELING_GrantSharedExpAndCheckLevelUp_6FCFDCB0_113c } from './k2-w6b6-113c.ts'
import { SKILLS_DoUsedSkillActionK3_113c } from './k3-p52-sorc-handlers-113c.ts'
import { SUNIT_IsDeadOrDying113c } from './monster-events.ts'
import {
  D2GAME_IAT_SGPT_DATATABLES_VA_113C,
  MONSTATS_GetRecordPtr113c,
  SKILLS_GetRecordPtrFast113c,
  SUNIT_ValidatePathTargetUnit113c,
} from './regpop-spawn-113c.ts'
import {
  MONSTER_ApplyModeVelocityOverride113c,
  PLAYER_StepModeWalkOrRun113c,
} from './replay-final11-113c.ts'
import {
  type FallenSliceWorld113c,
  getDifficultyIdx113c,
  SUNITDMG_ExecuteMissileOrMeleeDmg113c,
  syncActRoomsAndUnitsIntoWorld113c,
} from './replay-kernel-113c.ts'
import {
  calculateKillExperienceGainPure113c,
  getMonLvlXpRow113c,
  type MonStatsRow113c,
} from './tables-bootstrap-113c.ts'

export const VA_AI_HIREABLE_113C = 0x6fc3dd40

const K3_MERC_HEAP_BASE = 0x7e180000
let k3MercHeapPtr = K3_MERC_HEAP_BASE

function sx16(v: number): number {
  return (v << 16) >> 16
}

function sx8(v: number): number {
  return (v << 24) >> 24
}

function readSgptDataTables113c(m: Memory113c): number {
  const ptr = m.u32(D2GAME_IAT_SGPT_DATATABLES_VA_113C) >>> 0
  if (ptr === 0) return 0
  return m.u32(ptr) >>> 0
}

/**
 * Returns `true` when `pMonster` is a hireling unit (`pfnThink === 0x6FC3DD40` or `classId` in `{271, 338, 359, 560, 561}`).
 */
export function isHireableMonsterK3_113c(m: Memory113c, pMonster: number): boolean {
  if (pMonster === 0 || m.get(pMonster, D2UnitStrc.dwUnitType) !== UNIT_MONSTER) return false
  const classId = m.get(pMonster, D2UnitStrc.dwClassId) | 0
  if (
    classId === 0x10f ||
    classId === 0x152 ||
    classId === 0x167 ||
    classId === 0x230 ||
    classId === 0x231
  ) {
    return true
  }
  const pMonData = m.get(pMonster, D2UnitStrc.pUnitData)
  if (pMonData === 0) return false
  const pAiGen = m.get(pMonData, D2MonsterDataStrc.pAiGeneral)
  if (pAiGen === 0) return false
  return (m.get(pAiGen, D2AiGeneralStrc.pfnThink) >>> 0) === VA_AI_HIREABLE_113C
}

/**
 * Delegates hireling mode velocity override (`0x6FC94CE0`) to canonical `MONSTER_ApplyModeVelocityOverride113c`.
 */
export function applyHireableModeVelocityOverrideK3_113c(
  m: Memory113c,
  pMonster: number,
  pAiCtrl: number,
): boolean {
  if (pAiCtrl === 0 || !isHireableMonsterK3_113c(m, pMonster)) return false
  MONSTER_ApplyModeVelocityOverride113c(m, pAiCtrl, pMonster)
  return true
}

/**
 * Hydrates unloaded player breadcrumb tail (`+0xA0..+0x16B`), owner `D2PetListStrc` (`+0x44` slot `7`),
 * and `Hireling.txt` skills for `F2` snapshot worlds containing a hireling.
 */
export function hydrateMercHireableSnapshotStateK3_113c(
  world: FallenSliceWorld113c,
  saveBytes?: Uint8Array,
): void {
  const { m, pGame } = world
  k3MercHeapPtr = K3_MERC_HEAP_BASE

  const memInternal = m as unknown as { known?: Map<number, Uint8Array> }
  const isAddrLoaded = (addr: number): boolean => {
    const a = addr >>> 0
    if (a === 0) return false
    const kp = memInternal.known !== undefined ? memInternal.known.get(a >>> 12) : undefined
    return kp !== undefined && kp[a & 0xfff] !== 0
  }

  for (const pPlr of world.playerById.values()) {
    const pPlrData = m.u32((pPlr + 0x14) >>> 0) >>> 0
    if (pPlrData === 0) continue
    for (let off = 0xa0; off < 0x16c; off += 1) {
      const addr = (pPlrData + off) >>> 0
      if (!isAddrLoaded(addr)) {
        m.setU8(addr, 0)
      }
    }
  }

  let hasMerc = false
  for (const pMon of world.monsterById.values()) {
    if (isHireableMonsterK3_113c(m, pMon)) {
      hasMerc = true
      break
    }
  }
  if (!hasMerc) return

  bindK2KernelGlobals113c(m)
  MONSTER_GetHirelingLevelBonusFactor113c(m, pGame, 0)

  let wMercNameId = 0
  let dwMercSeed = 0
  let wMercType = 1
  if (saveBytes !== undefined && saveBytes.length >= 0xc0) {
    const dv = new DataView(saveBytes.buffer, saveBytes.byteOffset, saveBytes.byteLength)
    dwMercSeed = dv.getUint32(0xb3, true) >>> 0
    wMercNameId = dv.getUint16(0xb7, true)
    const rawType = dv.getUint16(0xb9, true)
    if (rawType > 0) {
      wMercType = rawType
    }
  }

  for (const [monId, pMon] of world.monsterById) {
    if (!isHireableMonsterK3_113c(m, pMon)) continue

    const pInv = m.u32((pMon + 0x60) >>> 0) >>> 0
    if (pInv !== 0 && !isAddrLoaded(pInv)) {
      m.setU32((pMon + 0x60) >>> 0, 0)
    }
    const pSkills = m.u32((pMon + 0xa8) >>> 0) >>> 0
    if (pSkills !== 0 && !isAddrLoaded(pSkills)) {
      m.setU32((pMon + 0xa8) >>> 0, 0)
    }

    const pMonData = m.get(pMon, D2UnitStrc.pUnitData)
    const pAiGen = pMonData !== 0 ? m.get(pMonData, D2MonsterDataStrc.pAiGeneral) : 0
    let pOwner = 0
    if (pAiGen !== 0 && m.u32((pAiGen + 0x28) >>> 0) !== 0) {
      const ownerGuid = m.u32((pAiGen + 0x2c) >>> 0) >>> 0
      const ownerType = m.u32((pAiGen + 0x30) >>> 0) | 0
      if (ownerType === UNIT_PLAYER) {
        const found = world.playerById.get(ownerGuid)
        pOwner = found !== undefined ? found : 0
      }
    }

    if (pOwner !== 0) {
      const pOwnerData = m.u32((pOwner + 0x14) >>> 0) >>> 0
      const pExistingPets = pOwnerData !== 0 ? (m.u32((pOwnerData + 0x44) >>> 0) >>> 0) : 0
      const petsLoaded =
        pExistingPets !== 0 &&
        isAddrLoaded(pExistingPets) &&
        isAddrLoaded(m.u32(pExistingPets) >>> 0)
      if (pOwnerData !== 0 && !petsLoaded) {
        const pPetWrap = k3MercHeapPtr
        const pSlotsArray = (pPetWrap + 0x10) >>> 0
        const pPetNode = (pSlotsArray + 0xc0) >>> 0
        k3MercHeapPtr = (pPetNode + 0x20) >>> 0
        m.fill(pPetWrap, 0xf0, 0)

        m.setU32((pOwnerData + 0x44) >>> 0, pPetWrap)
        m.setU32(pPetWrap, pSlotsArray)
        m.setU32((pSlotsArray + 0x54) >>> 0, pPetNode)
        m.setU32((pSlotsArray + 0x58) >>> 0, 1)

        m.setU32(pPetNode, 0)
        m.setU32((pPetNode + 0x04) >>> 0, monId >>> 0)
        m.setU32((pPetNode + 0x08) >>> 0, wMercNameId >>> 0)
        m.setU32((pPetNode + 0x0c) >>> 0, dwMercSeed >>> 0)
        m.setU32((pPetNode + 0x10) >>> 0, wMercType >>> 0)
        m.setU32((pPetNode + 0x14) >>> 0, 0)
      }
    }

    if (m.u32((pMon + 0xa8) >>> 0) === 0) {
      m.setU32(
        (pMon + 0xa8) >>> 0,
        SKILLS_AllocSkillList113c(m, m.u32((pGame + 0x1c) >>> 0)) >>> 0,
      )
      const nClassId = m.get(pMon, D2UnitStrc.dwClassId) | 0
      const pMonStats = MONSTATS_GetRecordPtr113c(m, nClassId) >>> 0
      if (pMonStats !== 0) {
        for (let i = 0; i < 8; i += 1) {
          const wSkill = sx16(m.u16((pMonStats + 0x170 + i * 2) >>> 0))
          if (wSkill < 0) continue
          const bBaseLvl = sx8(m.u8((pMonStats + 0x198 + i) >>> 0))
          if (bBaseLvl <= 0) continue
          SKILLS_SetSkillLevelOnUnit113c(m, pMon, wSkill, bBaseLvl, 0, 0x6fd1b980, 0x112a)
          const bSlot = sx8(m.u8((pMonStats + 0x180 + i) >>> 0))
          if (bSlot >= 0) {
            const pSk = SKILLS_GetSkillById113c(m, pMon, wSkill, 0xffffffff) >>> 0
            if (pSk !== 0) {
              SKILLS_SetSkillSlotIndex113c(m, pSk, bSlot)
            }
          }
        }
      }
      const mercLvl = STATLIST_GetUnitStat113c(m, pMon, 0x0c, 0) | 0
      const bExpansion = m.u32((pGame + 0x70) >>> 0) | 0
      const pHirelingTxt =
        DATATBLS_GetHirelingTxtRecordFromIdAndLevel113c(m, bExpansion, wMercType, mercLvl) >>> 0
      const pTables = readSgptDataTables113c(m)
      const nSkillsCount = pTables !== 0 ? (m.u32((pTables + 0xba0) >>> 0) | 0) : 0
      if (pHirelingTxt !== 0 && nSkillsCount > 0) {
        const baseLvl = m.u32((pHirelingTxt + 0x1c) >>> 0) | 0
        const lvlDelta = (mercLvl - baseLvl) | 0
        for (let slot = 0; slot < 6; slot += 1) {
          const skillId = m.u32((pHirelingTxt + 0x78 + slot * 4) >>> 0) | 0
          if (skillId <= 0 || skillId >= nSkillsCount) break
          const bMode = m.u8((pHirelingTxt + 0xc0 + slot) >>> 0)
          if (bMode >= 0x10) break
          const pSkillsTxt = SKILLS_GetRecordPtrFast113c(m, skillId)
          if (pSkillsTxt === 0) continue
          const reqLvl = sx16(m.u16((pSkillsTxt + 0x174) >>> 0))
          if (mercLvl < reqLvl) continue
          const lvlPerLvl = sx8(m.u8((pHirelingTxt + 0xcc + slot) >>> 0))
          const baseSlvl = sx8(m.u8((pHirelingTxt + 0xc6 + slot) >>> 0))
          let slvl = (((imul32(lvlPerLvl, lvlDelta) >> 5) | 0) + baseSlvl) | 0
          if (slvl < 0) slvl = 0
          else if (slvl > 32) slvl = 32
          if (slvl > 0) {
            SKILLS_SetSkillLevelOnUnit113c(m, pMon, skillId, slvl, 0, 0x6fd1b980, 0x112a)
          }
        }
      }
    }
  }
}

/**
 * Routes player walk/run breadcrumb recording through canonical `PLAYER_StepModeWalkOrRun113c` (`0x6FC99B90`).
 */
export function recordPlayerWalkBreadcrumbK3_113c(
  m: Memory113c,
  pGame: number,
  pPlayer: number,
): void {
  if (pGame === 0 || pPlayer === 0) return
  PLAYER_StepModeWalkOrRun113c(m, pGame, pPlayer, true)
}

/**
 * Routes monster skill-mode start (`0x6FC95510`) through canonical `MONSTER_StartAttackOrCast113c`.
 */
export function onMonsterStartSkillModeK3_113c(
  m: Memory113c,
  pGame: number,
  pMonster: number,
): void {
  const pUsed = SKILLS_GetUsedSkillMemPort113c(m, pMonster) >>> 0
  if (pUsed === 0) return
  bindK2KernelGlobals113c(m)
  MONSTER_StartAttackOrCast113c(
    m,
    pGame,
    pMonster,
    {
      onSkillDoStart(mem, pUnit, pg) {
        const used = SKILLS_GetUsedSkillMemPort113c(mem, pUnit) >>> 0
        if (used === 0) return 0
        const skId = SKILLS_GetSkillIdFromSkill113c(mem, used, 0, 0) | 0
        const pSkTxt = skId >= 0 ? SKILLS_GetRecordPtrFast113c(mem, skId) : 0
        if (pSkTxt !== 0 && sx16(mem.u16((pSkTxt + 0x2c) >>> 0)) === 32) {
          SKILLS_SrvSt32_EnsureWeaponOrQuiverOrStartCast_6FC6C840_113c(mem, pg, pUnit)
        }
        return SKILLS_StartUsedSkill113c(mem, pUnit, pg)
      },
    },
    true,
  )
}

/**
 * Routes hireling AI think (`0x6FC3DD40`) directly to canonical `AI_ThinkMercenaryMain_6FC3DD40_113c`.
 */
export function runHireableAiThinkK3_113c(
  world: MonsterSliceWorldLike113c,
  pMerc: number,
): void {
  AI_ThinkMercenaryMain_6FC3DD40_113c(
    world as FallenSliceWorld113c & SparseMemory113c,
    pMerc,
  )
}

/**
 * Routes monster attack / skill / missile step (`0x6FC95CE0` -> `0x6FC95C60` / `0x6FC97790`)
 * through canonical `MONSTER_AdvanceAttackOrSkillStep113c`.
 */
export function stepMonsterAttackOrSkillActionK3_113c(
  world: FallenSliceWorld113c,
  pMonster: number,
  arg14: number,
  hooks: K2GapMeleeDotHooks113c,
): void {
  const { m, pGame } = world
  const pUsedSkill = SKILLS_GetUsedSkillMemPort113c(m, pMonster) >>> 0
  if (pUsedSkill !== 0) {
    if (arg14 === 1 || arg14 === 2) {
      bindK2KernelGlobals113c(m)
      MONSTER_AdvanceAttackOrSkillStep113c(m, pGame, pMonster, world, {
        onSkillDoStep(mem, pUnit, pg) {
          SKILLS_DoUsedSkillActionK3_113c(mem, pUnit, pg, hooks)
          return 1
        },
      })
      syncActRoomsAndUnitsIntoWorld113c(world)
    }
    return
  }

  const modeMissileId = MONSTER_GetMissileIdForAnimMode113c(m, pMonster, 0) | 0
  if (modeMissileId >= 0) {
    if (arg14 === 1 || arg14 === 2) {
      bindK2KernelGlobals113c(m)
      MONSTER_AdvanceAttackOrSkillStep113c(m, pGame, pMonster, world, {
        onSpawnModeMissile(mem, pg, mid, pUnit, _pTarget, lvl) {
          SUNIT_ValidatePathTargetUnit113c(mem, pUnit, pg)
          const useUnitLvl = ((mem.get(pUnit, D2UnitStrc.dwFlags) >>> 9) & 1) !== 0
          let projLvl = lvl | 0
          if (!useUnitLvl) {
            const diff = getDifficultyIdx113c(mem, pg)
            const pTables = readSgptDataTables113c(mem)
            const pGameLvl = pTables !== 0 ? (mem.u32((pTables + 0xbc0) >>> 0) >>> 0) : 0
            projLvl = pGameLvl !== 0 ? ((mem.u32((pGameLvl + diff * 0x10 + 0x10) >>> 0) | 0) + 1) | 0 : 1
          }
          return SKILLS_CreateDirectionalProjectileWithToHitAndAmmo_6FCC28F0_113c(
            mem,
            pg,
            mid,
            pUnit,
            0,
            projLvl,
            0,
            0,
            0,
            0,
            1,
          )
        },
      })
      syncActRoomsAndUnitsIntoWorld113c(world)
    }
    return
  }

  if (arg14 === 1) {
    if (isSgptDataTablesReadyForMonsterStep(m)) {
      MONSTER_AdvanceAttackOrSkillStep113c(m, pGame, pMonster, world)
    } else {
      const pPath = m.get(pMonster, D2UnitStrc.pPath)
      const pDef = pPath !== 0 ? PATH_GetTargetUnit113c(m, pPath) : 0
      if (pDef !== 0 && pDef !== pMonster && SUNIT_IsDeadOrDying113c(m, pDef) === 0) {
        SUNITDMG_ExecuteMissileOrMeleeDmg113c(world, pMonster, pDef)
      }
    }
  }
}

function isSgptDataTablesReadyForMonsterStep(m: Memory113c): boolean {
  const memInternal = m as unknown as { known?: Map<number, Uint8Array> }
  if (memInternal.known === undefined) return false
  const a = D2GAME_IAT_SGPT_DATATABLES_VA_113C >>> 0
  const kp = memInternal.known.get(a >>> 12)
  if (kp === undefined || kp[a & 0xfff] === 0) return false
  return readSgptDataTables113c(m) !== 0
}

/**
 * Routes monster kill XP award (`0x6FCFB5E0` -> `0x6FCFDCB0` + `0x6FCFE6D0`) through canonical
 * `SUNITDMG_ResolveAttackerPlayer113c`, `HIRELING_GrantSharedExpAndCheckLevelUp_6FCFDCB0_113c`,
 * and `SUNITDMG_AddPlayerExperienceAndCheckLevelUp113c`.
 */
export function awardMonsterKillExperienceWithMercK3_113c(
  world: MonsterSliceWorldLike113c,
  pMonster: number,
  pKiller: number,
  row: MonStatsRow113c,
): void {
  const { m, pGame } = world
  if (pKiller === 0) return

  const pKillerPlayer = SUNITDMG_ResolveAttackerPlayer113c(m, pGame, pKiller)
  if (pKillerPlayer === 0 || m.get(pKillerPlayer, D2UnitStrc.dwUnitType) !== UNIT_PLAYER) return

  const diff = getDifficultyIdx113c(m, pGame)
  const mlvl = STATLIST_GetUnitStat113c(m, pMonster, 0x0c, 0) | 0

  let rawExp = STATLIST_GetUnitStat113c(m, pMonster, 0x0d, 0) | 0
  if (rawExp <= 0) {
    const monExpFactor = row.exp[diff]
    if (monExpFactor > 0 && mlvl > 0) {
      if (row.noRatio) {
        rawExp = monExpFactor
      } else {
        const xpVec = getMonLvlXpRow113c(mlvl)
        rawExp = Math.trunc((xpVec[diff] * monExpFactor) / 100)
      }
    }
  }
  if (rawExp <= 0) return

  let pLiveMerc = 0
  const pPlayerData = UNITS_GetPlayerData113c(m, pKillerPlayer) >>> 0
  if (pPlayerData !== 0) {
    const pPetWrap = m.u32((pPlayerData + 0x44) >>> 0) >>> 0
    const pSlots = pPetWrap !== 0 ? (m.u32(pPetWrap) >>> 0) : 0
    if (pSlots !== 0) {
      let pNode = m.u32((pSlots + 0x54) >>> 0) >>> 0
      while (pNode !== 0) {
        if ((m.u8(pNode) & 1) === 0) {
          const mercGuid = m.u32((pNode + 0x04) >>> 0) >>> 0
          pLiveMerc = SUNIT_GetServerUnit113c(m, pGame, 1, mercGuid) >>> 0
          break
        }
        pNode = m.u32((pNode + 0x14) >>> 0) >>> 0
      }
    }
  }

  if (pLiveMerc !== 0 && SUNIT_IsDeadOrDying113c(m, pLiveMerc) === 0) {
    const mercLvl = STATLIST_GetUnitStat113c(m, pLiveMerc, 0x0c, 0) | 0
    const mercAddExpPct = STATLIST_GetUnitStat113c(m, pLiveMerc, 0x55, 0) | 0
    let mercGain = calculateKillExperienceGainPure113c({
      rawExp,
      clvl: mercLvl,
      mlvl,
      addExpPct: mercAddExpPct,
    })
    if (pKiller !== pLiveMerc) {
      mercGain = sdiv32(imul32(mercGain, 0x56), 256)
    }
    if (mercGain > 0) {
      bindK2KernelGlobals113c(m)
      HIRELING_GrantSharedExpAndCheckLevelUp_6FCFDCB0_113c(
        m,
        mercGain,
        pGame,
        pKillerPlayer,
        pLiveMerc,
        mercLvl,
      )
    }
  }

  const clvl = STATLIST_GetUnitStat113c(m, pKillerPlayer, 0x0c, 0) | 0
  const addExpPct = STATLIST_GetUnitStat113c(m, pKillerPlayer, 0x55, 0) | 0
  const gain = calculateKillExperienceGainPure113c({
    rawExp,
    clvl,
    mlvl,
    addExpPct,
  })
  if (gain > 0) {
    SUNITDMG_AddPlayerExperienceAndCheckLevelUp113c(m, pGame, pKillerPlayer, gain, true)
  }
}
