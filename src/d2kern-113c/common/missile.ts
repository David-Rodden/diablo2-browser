/**
 * Diablo II v1.13c `D2Common.dll` missile unit data accessors, damage scaling helper,
 * and hireling type classifier (Batch B023: `0x6FD6A2D0`, `0x6FDB9C60..0x6FDBA750`).
 *
 * Binary evidence (`objdump -d -M intel ~/d2-data/D2Common.dll`, image base `0x6FD50000`):
 * - Every missile unit data accessor verifies `pMissile != NULL && pMissile->dwUnitType == 3 (UNIT_MISSILE) && pMissile->pUnitData != NULL`.
 * - `D2MissileDataStrc` (52 bytes, allocated at `0x6FDBA3B2`) stores 16-bit frame/skill/level counters at `+0x04..+0x10`,
 *   stream flags at `+0x14`, and owner type/id at `+0x18/+0x1C`.
 * - `MISSILE_ScaleDamageDataBy128thsInline113c` (`0x6FDB9C60`) scales 17 signed dwords in `D2MissileDamageDataStrc`
 *   by `(val * scale + ((val * scale < 0) ? 127 : 0)) >> 7` (`imul; cdq; and edx, 0x7f; add eax, edx; sar eax, 7`)
 *   whenever `nScale128 != 128`.
 */
import type { Memory113c } from '../mem/sparse-memory.ts'
import {
  D2MissileDamageDataStrc,
  D2MissileDataStrc,
  D2MissileDataStrc_SIZE,
  D2MissilesTxt,
  D2UnitStrc,
  type FieldLayout113c,
} from '../mem/layout.generated.ts'
import {
  D2COMMON_GDWBITMASKS_IAT_VA_113C,
  DATATBLS_GetMissilesTxtRecordInline113c,
} from './inline-helpers.ts'
import { imul32, sar32 } from './int-math.ts'

const UNIT_MONSTER = 1
const UNIT_MISSILE = 3

function s16(v: number): number {
  return (v << 16) >> 16
}

function getMissileData(m: Memory113c, pMissile: number): number {
  if (pMissile === 0) return 0
  if (m.get(pMissile, D2UnitStrc.dwUnitType) !== UNIT_MISSILE) return 0
  return m.get(pMissile, D2UnitStrc.pUnitData)
}

function clampS16(v: number): number {
  const n = v | 0
  if (n > 0x7fff) return 0x7fff
  if (n < -0x8000) return -0x8000
  return n
}

function clampNonNegS16(v: number): number {
  const n = v | 0
  if (n > 0x7fff) return 0x7fff
  if (n < 0) return 0
  return n
}

function scaleDmgFieldBy128(m: Memory113c, pDmgData: number, field: FieldLayout113c, scale: number): void {
  const prod = imul32(m.get(pDmgData, field) | 0, scale)
  const bias = (prod >> 31) & 0x7f
  m.set(pDmgData, field, sar32((prod + bias) | 0, 7) >>> 0)
}

/**
 * `@va D2Common:0x6FD6A2D0` (`MONSTERS_GetHirelingTypeId`, export `#11104`,
 * `stdcall (pUnit) -> int`, `ret 4`).
 *
 * Returns the hireling act/type identifier (`1..4`) for monster units matching classic
 * hireling class IDs (`0x10F` -> `1`, `0x152` -> `2`, `0x167` -> `3`, `0x230..0x231` -> `4`),
 * or `0` otherwise.
 */
export function MONSTERS_GetHirelingTypeId113c(m: Memory113c, pUnit: number): number {
  if (pUnit === 0) return 0
  if (m.get(pUnit, D2UnitStrc.dwUnitType) !== UNIT_MONSTER) return 0
  const classId = m.get(pUnit, D2UnitStrc.dwClassId) >>> 0
  if (classId === 0x10f) return 1
  if (classId === 0x152) return 2
  if (classId === 0x167) return 3
  if (((classId - 0x230) >>> 0) <= 1) return 4
  return 0
}

/**
 * `@va D2Common:0x6FDB9C60` (`MISSILE_ScaleDamageDataBy128thsInline`, internal LTCG helper,
 * `ecx = pDmgData`, `esi = nScale128` -> `void`).
 *
 * When `nScale128 != 128`, scales 17 signed dwords of `D2MissileDamageDataStrc` in place by
 * `(val * nScale128) / 128` truncated toward zero (`imul; cdq; and edx, 0x7F; add eax, edx; sar eax, 7`).
 */
export function MISSILE_ScaleDamageDataBy128thsInline113c(
  m: Memory113c,
  pDmgData: number,
  nScale128: number,
): void {
  const scale = nScale128 | 0
  if (scale === 128) return
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nFireMinDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nFireMaxDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nLtngMinDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nLtngMaxDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nMagMinDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nMagMaxDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nColdMinDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nColdMaxDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nColdLength, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nPoisMinDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nPoisMaxDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nPoisCount, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nLifeDrainMinDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nManaDrainMinDamage, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nBurningMin, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nBurningMax, scale)
  scaleDmgFieldBy128(m, pDmgData, D2MissileDamageDataStrc.nBurnLength, scale)
}

/**
 * `@va D2Common:0x6FDB9E70` (`MISSILE_GetHitShiftFromId`, export `#10557`,
 * `stdcall (nMissileId) -> uint8`, `ret 4`).
 *
 * Looks up `MissilesTxt[nMissileId]`; returns `0` (`xor al, al`) if NULL, else `rec->nHitShift (+0xE4)` in `al`.
 */
export function MISSILE_GetHitShiftFromId113c(m: Memory113c, nMissileId: number): number {
  const rec = DATATBLS_GetMissilesTxtRecordInline113c(m, nMissileId)
  if (rec === 0) return 0
  return m.get(rec, D2MissilesTxt.nHitShift) & 0xff
}

/**
 * `@va D2Common:0x6FDB9F50` (`MISSILE_GetTargetY`, export `#10818`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 */
export function MISSILE_GetTargetY113c(m: Memory113c, pMissile: number): number {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return 0
  return m.get(pData, D2MissileDataStrc.nTargetY) | 0
}

/**
 * `@va D2Common:0x6FDB9F70` (`MISSILE_SetTargetY`, export `#10019`,
 * `stdcall (pMissile, nTargetY) -> void`, `ret 8`).
 */
export function MISSILE_SetTargetY113c(m: Memory113c, pMissile: number, nTargetY: number): void {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return
  m.set(pData, D2MissileDataStrc.nTargetY, nTargetY >>> 0)
}

/**
 * `@va D2Common:0x6FDB9F90` (`MISSILE_GetTargetX`, export `#11018`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 */
export function MISSILE_GetTargetX113c(m: Memory113c, pMissile: number): number {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return 0
  return m.get(pData, D2MissileDataStrc.nTargetX) | 0
}

/**
 * `@va D2Common:0x6FDB9FB0` (`MISSILE_SetTargetX`, export `#10637`,
 * `stdcall (pMissile, nTargetX) -> void`, `ret 8`).
 */
export function MISSILE_SetTargetX113c(m: Memory113c, pMissile: number, nTargetX: number): void {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return
  m.set(pData, D2MissileDataStrc.nTargetX, nTargetX >>> 0)
}

/**
 * `@va D2Common:0x6FDBA030` (`MISSILE_GetActivateFrame`, export `#10130`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 */
export function MISSILE_GetActivateFrame113c(m: Memory113c, pMissile: number): number {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return 0
  return s16(m.get(pData, D2MissileDataStrc.nActivateFrame))
}

/**
 * `@va D2Common:0x6FDBA050` (`MISSILE_GetActivateFrameFromUnit`, export `#10677`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 *
 * Verifies `pMissile != NULL && pMissile->dwUnitType == 3`, looks up `MissilesTxt[pMissile->dwClassId]`,
 * and returns `movzx eax, byte ptr [rec+0x94]` (`nActivate`) or `0`.
 */
export function MISSILE_GetActivateFrameFromUnit113c(m: Memory113c, pMissile: number): number {
  if (pMissile === 0) return 0
  if (m.get(pMissile, D2UnitStrc.dwUnitType) !== UNIT_MISSILE) return 0
  const rec = DATATBLS_GetMissilesTxtRecordInline113c(m, m.get(pMissile, D2UnitStrc.dwClassId) | 0)
  if (rec === 0) return 0
  return m.get(rec, D2MissilesTxt.nActivate)
}

/**
 * `@va D2Common:0x6FDBA130` (`MISSILE_IsOwnedByUnit`, export `#10227`,
 * `stdcall (pMissile, pOwner) -> BOOL`, `ret 8`).
 *
 * Verifies `pMissile != NULL && pOwner != NULL && pMissile->dwUnitType == 3`, checks bit 0 of
 * `MissilesTxt[dwClassId]->dwMissileFlags (+0x04)` via `gdwBitMasks[0]`, and compares
 * `pData->nOwnerType (+0x18) == pOwner->dwUnitType` and `pData->dwOwnerId (+0x1C) == pOwner->dwUnitId`.
 */
export function MISSILE_IsOwnedByUnit113c(m: Memory113c, pMissile: number, pOwner: number): number {
  if (pMissile === 0) return 0
  if (pOwner === 0) return 0
  if (m.get(pMissile, D2UnitStrc.dwUnitType) !== UNIT_MISSILE) return 0
  const rec = DATATBLS_GetMissilesTxtRecordInline113c(m, m.get(pMissile, D2UnitStrc.dwClassId) | 0)
  if (rec === 0) return 0
  const pBitMasks = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
  if ((m.u8(pBitMasks) & m.get(rec, D2MissilesTxt.dwMissileFlags)) === 0) return 0
  const pData = m.get(pMissile, D2UnitStrc.pUnitData)
  if (pData === 0) return 0
  if (m.get(pData, D2MissileDataStrc.nOwnerType) !== m.get(pOwner, D2UnitStrc.dwUnitType)) return 0
  return m.get(pData, D2MissileDataStrc.dwOwnerId) === m.get(pOwner, D2UnitStrc.dwUnitId) ? 1 : 0
}

/**
 * `@va D2Common:0x6FDBA1B0` (`MISSILE_SetOwner`, export `#10024`,
 * `stdcall (pMissile, pOwner) -> void`, `ret 8`).
 *
 * Verifies `pMissile != NULL && pMissile->dwUnitType == 3`, checks bit 0 of `MissilesTxt[dwClassId]->dwMissileFlags (+0x04)`,
 * and requires non-null `pUnitData`. If `pOwner == NULL`, writes `-1` (`0xFFFFFFFF`) to `pData->dwOwnerId (+0x1C)`
 * leaving `nOwnerType (+0x18)` unchanged; otherwise copies `pOwner->dwUnitType` and `pOwner->dwUnitId`.
 */
export function MISSILE_SetOwner113c(m: Memory113c, pMissile: number, pOwner: number): void {
  if (pMissile === 0) return
  if (m.get(pMissile, D2UnitStrc.dwUnitType) !== UNIT_MISSILE) return
  const rec = DATATBLS_GetMissilesTxtRecordInline113c(m, m.get(pMissile, D2UnitStrc.dwClassId) | 0)
  if (rec === 0) return
  const pBitMasks = m.u32(D2COMMON_GDWBITMASKS_IAT_VA_113C)
  if ((m.u8(pBitMasks) & m.get(rec, D2MissilesTxt.dwMissileFlags)) === 0) return
  const pData = m.get(pMissile, D2UnitStrc.pUnitData)
  if (pData === 0) return
  if (pOwner === 0) {
    m.set(pData, D2MissileDataStrc.dwOwnerId, 0xffffffff)
    return
  }
  m.set(pData, D2MissileDataStrc.nOwnerType, m.get(pOwner, D2UnitStrc.dwUnitType))
  m.set(pData, D2MissileDataStrc.dwOwnerId, m.get(pOwner, D2UnitStrc.dwUnitId))
}

/**
 * `@va D2Common:0x6FDBA220` (`MISSILE_GetClassId`, export `#10191`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 */
export function MISSILE_GetClassId113c(m: Memory113c, pMissile: number): number {
  if (pMissile === 0) return 0
  if (m.get(pMissile, D2UnitStrc.dwUnitType) !== UNIT_MISSILE) return 0
  return m.get(pMissile, D2UnitStrc.dwClassId) | 0
}

/**
 * `@va D2Common:0x6FDBA240` (`MISSILE_GetElapsedFrames`, export `#10985`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 *
 * Returns `s16(pData->nTotalFrames) - s16(pData->nRemainingFrames)`, or `0` if invalid.
 */
export function MISSILE_GetElapsedFrames113c(m: Memory113c, pMissile: number): number {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return 0
  return (s16(m.get(pData, D2MissileDataStrc.nTotalFrames)) - s16(m.get(pData, D2MissileDataStrc.nRemainingFrames))) | 0
}

/**
 * `@va D2Common:0x6FDBA270` (`MISSILE_GetRemainingFrames`, export `#10737`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 */
export function MISSILE_GetRemainingFrames113c(m: Memory113c, pMissile: number): number {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return 0
  return s16(m.get(pData, D2MissileDataStrc.nRemainingFrames))
}

/**
 * `@va D2Common:0x6FDBA290` (`MISSILE_GetTotalFrames`, export `#10534`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 */
export function MISSILE_GetTotalFrames113c(m: Memory113c, pMissile: number): number {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return 0
  return s16(m.get(pData, D2MissileDataStrc.nTotalFrames))
}

/**
 * `@va D2Common:0x6FDBA2B0` (`MISSILE_GetSkill`, export `#10240`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 */
export function MISSILE_GetSkill113c(m: Memory113c, pMissile: number): number {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return 0
  return s16(m.get(pData, D2MissileDataStrc.nSkill))
}

/**
 * `@va D2Common:0x6FDBA2D0` (`MISSILE_GetLevel`, export `#11029`,
 * `stdcall (pMissile) -> int`, `ret 4`).
 */
export function MISSILE_GetLevel113c(m: Memory113c, pMissile: number): number {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return 0
  return s16(m.get(pData, D2MissileDataStrc.nLevel))
}

/**
 * `@va D2Common:0x6FDBA2F0` (`MISSILE_SetLevel`, export `#10652`,
 * `stdcall (pMissile, nLevel) -> void`, `ret 8`).
 *
 * Unclamped 16-bit write `mov cx, [esp+8]; mov [eax+0x0C], cx`.
 */
export function MISSILE_SetLevel113c(m: Memory113c, pMissile: number, nLevel: number): void {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return
  m.set(pData, D2MissileDataStrc.nLevel, nLevel & 0xffff)
}

/**
 * `@va D2Common:0x6FDBA310` (`MISSILE_SetStreamFlags`, export `#11035`,
 * `stdcall (pMissile, dwStreamFlags) -> void`, `ret 8`).
 */
export function MISSILE_SetStreamFlags113c(m: Memory113c, pMissile: number, dwStreamFlags: number): void {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return
  m.set(pData, D2MissileDataStrc.dwStreamFlags, dwStreamFlags >>> 0)
}

/**
 * `@va D2Common:0x6FDBA330` (`MISSILE_GetStreamFlags`, export `#10623`,
 * `stdcall (pMissile) -> uint32`, `ret 4`).
 */
export function MISSILE_GetStreamFlags113c(m: Memory113c, pMissile: number): number {
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return 0
  return m.get(pData, D2MissileDataStrc.dwStreamFlags)
}

/**
 * `@va D2Common:0x6FDBA690` (`MISSILE_SetActivateFrame`, export `#10837`,
 * `stdcall (pMissile, nActivateFrame) -> void`, `ret 8`).
 *
 * Clamps signed 32-bit `nActivateFrame` to `[-32768, 32767]` before storing `u16` at `+0x08`.
 */
export function MISSILE_SetActivateFrame113c(m: Memory113c, pMissile: number, nActivateFrame: number): void {
  const clamped = clampS16(nActivateFrame)
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return
  m.set(pData, D2MissileDataStrc.nActivateFrame, clamped & 0xffff)
}

/**
 * `@va D2Common:0x6FDBA6D0` (`MISSILE_SetRemainingFrames`, export `#10970`,
 * `stdcall (pMissile, nRemainingFrames) -> void`, `ret 8`).
 *
 * Clamps signed 32-bit `nRemainingFrames` to `[-32768, 32767]` before storing `u16` at `+0x10`.
 */
export function MISSILE_SetRemainingFrames113c(m: Memory113c, pMissile: number, nRemainingFrames: number): void {
  const clamped = clampS16(nRemainingFrames)
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return
  m.set(pData, D2MissileDataStrc.nRemainingFrames, clamped & 0xffff)
}

/**
 * `@va D2Common:0x6FDBA710` (`MISSILE_SetTotalFrames`, export `#10558`,
 * `stdcall (pMissile, nTotalFrames) -> void`, `ret 8`).
 *
 * Clamps signed 32-bit `nTotalFrames` to `[-32768, 32767]` before storing `u16` at `+0x0E`.
 */
export function MISSILE_SetTotalFrames113c(m: Memory113c, pMissile: number, nTotalFrames: number): void {
  const clamped = clampS16(nTotalFrames)
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return
  m.set(pData, D2MissileDataStrc.nTotalFrames, clamped & 0xffff)
}

/**
 * `@va D2Common:0x6FDBA750` (`MISSILE_SetSkill`, export `#11167`,
 * `stdcall (pMissile, nSkill) -> void`, `ret 8`).
 *
 * Clamps signed 32-bit `nSkill` to `[0, 32767]` before storing `u16` at `+0x0A`.
 */
export function MISSILE_SetSkill113c(m: Memory113c, pMissile: number, nSkill: number): void {
  const clamped = clampNonNegS16(nSkill)
  const pData = getMissileData(m, pMissile)
  if (pData === 0) return
  m.set(pData, D2MissileDataStrc.nSkill, clamped & 0xffff)
}

/**
 * `@va D2Common:0x6FDBA350` (`D2Common.#10178` `MISSILE_FreeMissileData`, 49 bytes,
 * stdcall `[esp+4] = pMissile`, `ret 0x4`, void).
 */
export function MISSILE_FreeMissileData113c(m: Memory113c, pMissile: number): void {
  if (pMissile >>> 0 === 0 || m.get(pMissile, D2UnitStrc.dwUnitType) !== UNIT_MISSILE) {
    return
  }
  const pMissileData = m.get(pMissile, D2UnitStrc.pUnitData)
  if (pMissileData !== 0) {
    m.get(pMissile, D2UnitStrc.pMemPool)
    ;(m as { free?: (p: number) => void }).free?.(pMissileData)
    m.set(pMissile, D2UnitStrc.pUnitData, 0)
  }
}

/**
 * `@va D2Common:0x6FDBA390` (`D2Common.#10098` `MISSILE_AllocMissileData`, 72 bytes,
 * stdcall `[esp+4] = pMissile`, `ret 0x4`, void).
 */
export function MISSILE_AllocMissileData113c(m: Memory113c, pMissile: number): void {
  if (pMissile >>> 0 === 0 || m.get(pMissile, D2UnitStrc.dwUnitType) !== UNIT_MISSILE) {
    return
  }
  if (m.get(pMissile, D2UnitStrc.pUnitData) !== 0) {
    return
  }
  m.get(pMissile, D2UnitStrc.pMemPool)
  const pData = m.alloc(D2MissileDataStrc_SIZE)
  for (let i = 0; i < D2MissileDataStrc_SIZE; i += 4) {
    m.setU32((pData + i) >>> 0, 0)
  }
  m.set(pData, D2MissileDataStrc.dwOwnerId, 0xffffffff)
  m.set(pMissile, D2UnitStrc.pUnitData, pData >>> 0)
}
