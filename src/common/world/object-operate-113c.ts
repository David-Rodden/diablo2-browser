/**
 * Objects.txt `OperateFn` classification used by the authoritative GameInstance.
 *
 * The 1.13c server dispatch table (D2Game.dll 0x6fd27bb8) has one function per OperateFn.
 * The web server groups them into the handful of observable behaviours it implements:
 * shrine, door, portal, stash, well, trap, destructible, container and a generic
 * mode-only operate. Classification is driven by the numeric `OperateFn` column (and
 * the numeric `isDoor` flag), never by English name substrings.
 */
import { CANONICAL_113C_OBJECTS, CANONICAL_113C_SHRINES, getShrineMeta113c } from './objects-meta.ts'
import { OBJECTS_TXT_113C, getObjectsTxtRecord113c } from './objects-txt-113c.ts'

export type ObjectOperateKind113c =
  | 'shrine'
  | 'door'
  | 'portal'
  | 'stash'
  | 'well'
  | 'trap'
  | 'destructible'
  | 'container'
  | 'mode'

/**
 * 1.13c `gpObjectOperateFnTable` behaviour groups, keyed by the numeric
 * `Objects.txt` `OperateFn`. Only rows whose function has a distinct observable
 * behaviour are listed; everything else falls back to `'mode'`.
 */
const OPERATE_FN_KIND_113C: Readonly<Record<number, ObjectOperateKind113c>> = {
  1: 'container', // Casket / Sarcophagus
  2: 'shrine', // Shrine
  3: 'container', // Urn / Basket
  4: 'container', // Chest / Locked Chest
  5: 'destructible', // Barrel
  6: 'container', // Tower Tome / Wirt's body
  7: 'destructible', // Exploding Barrel
  8: 'door', // Door
  10: 'destructible', // Gibbet
  14: 'container', // Crate / Corpse / Hollow Log
  15: 'portal', // Portal
  16: 'door', // TrappDoor
  18: 'door', // Door
  19: 'container', // Armor Stand
  20: 'container', // Weapon Rack
  22: 'well', // Well
  23: 'portal', // Waypoint (also flagged `isWaypoint`)
  26: 'container', // Bookshelf
  27: 'portal', // Teleport Pad
  29: 'door', // Door
  30: 'trap', // Trap / Exploding Chest
  31: 'container', // Gidbinn / Armor Stand
  32: 'stash', // Bank
  33: 'container', // Wirt's Body
  34: 'portal', // Portal
  36: 'stash', // Guild Vault
  37: 'container', // Trophy Case
  39: 'container', // Chest
  40: 'container', // Chest
  41: 'container', // Chest
  42: 'container', // Tome
  43: 'portal', // Duriel's Lair / Guild Portal
  44: 'portal', // Sewer Stairs
  46: 'portal', // Portal / Siege Control
  47: 'portal', // Stair
  48: 'container', // Trapped Soul
  51: 'stash', // Stash
  57: 'container', // Chest
  58: 'container', // Sparkling Chest
  59: 'container', // Chest
  61: 'door', // Gate
  66: 'portal', // To The Worldstone Keep
  68: 'container', // Evil Urn
  70: 'portal', // Worldstone Chamber / Throne
  71: 'portal', // Glacial Caves
  73: 'portal', // Harrogath
}

/** Classify one Objects.txt row by its canonical numeric OperateFn / door / shrine metadata. */
export function classifyObjectOperate113c(classId: number): ObjectOperateKind113c {
  const record = getObjectsTxtRecord113c(classId)
  const meta = CANONICAL_113C_OBJECTS[classId]
  if (record.isDoor === 1) return 'door'
  if (meta?.isShrine || record.operateFn === 2) return 'shrine'
  return OPERATE_FN_KIND_113C[record.operateFn] ?? 'mode'
}

/**
 * 1.13c `D2Game.dll` `OBJECTS_InitShrines` (`0x6fc2b9a0..0x6fc2bbe8`):
 * Scans `Shrines.txt` rows `0..22` in table order and appends each shrine `Code` (`1..22`)
 * into its `effectclass` (`1..4`) candidate list (`D2ShrinesRegionStrc`).
 */
export const SHRINES_BY_EFFECT_CLASS_113C: Readonly<Record<1 | 2 | 3 | 4, readonly number[]>> =
  Object.freeze({
    1: Object.freeze(
      Object.entries(CANONICAL_113C_SHRINES)
        .map(([k, v]) => [Number(k), v] as const)
        .filter(([code, v]) => code >= 1 && code <= 22 && v.effectclass === 1)
        .sort(([a], [b]) => a - b)
        .map(([code]) => code),
    ),
    2: Object.freeze(
      Object.entries(CANONICAL_113C_SHRINES)
        .map(([k, v]) => [Number(k), v] as const)
        .filter(([code, v]) => code >= 1 && code <= 22 && v.effectclass === 2)
        .sort(([a], [b]) => a - b)
        .map(([code]) => code),
    ),
    3: Object.freeze(
      Object.entries(CANONICAL_113C_SHRINES)
        .map(([k, v]) => [Number(k), v] as const)
        .filter(([code, v]) => code >= 1 && code <= 22 && v.effectclass === 3)
        .sort(([a], [b]) => a - b)
        .map(([code]) => code),
    ),
    4: Object.freeze(
      Object.entries(CANONICAL_113C_SHRINES)
        .map(([k, v]) => [Number(k), v] as const)
        .filter(([code, v]) => code >= 1 && code <= 22 && v.effectclass === 4)
        .sort(([a], [b]) => a - b)
        .map(([code]) => code),
    ),
  })

/**
 * 1.13c `D2Game.dll` `0x6fc4f089..0x6fc4f0b1`:
 * Remaps deprecated shrine codes before assigning `bInteractType`:
 * - `5` (Mana Exchange) -> `3` (Mana)
 * - `4` (Health Exchange) -> `2` (Health)
 * - `16` (Enirhs) -> `18` (Gem)
 */
export function remapShrineCode113c(code: number): number {
  if (code === 5) return 3
  if (code === 4) return 2
  if (code === 16) return 18
  return code
}

/**
 * 1.13c `D2Game.dll` Object `InitFn 1` (`0x6fc4ef90`) and `sub_6FC4ED70` (`0x6fc4ed70`):
 * Selects the shrine type (`Shrines.txt` `Code 1..22`) for a shrine object (`classId`) spawned in
 * `areaId` (`levelId`):
 * - `Parm0 === 0`: rolls `1 + rand(22)` up to 8 times until `levelId >= LevelMin`.
 * - `Parm0 === 1`: selects from `effectclass = 2` (`[2, 4]`), remapped to `2` (Health Shrine).
 * - `Parm0 === 2`: selects from `effectclass = 3` (`[3, 5]`), remapped to `3` (Mana Shrine).
 * - `Parm0 >= 3`: rolls `rand(10) === 0 ? 1 : 4` (10% `effectclass 1`, 90% `effectclass 4`),
 *   then rolls up to 8 times from that `effectclass` bucket until `levelId >= LevelMin`.
 * - Applies the `5 -> 3`, `4 -> 2`, `16 -> 18` remap (`0x6fc4f089`).
 */
export function rollShrineType113c(
  classId: number,
  areaId: number,
  rng: { rand(max: number): number },
): number {
  const objTxt =
    classId >= 0 && classId < OBJECTS_TXT_113C.length ? OBJECTS_TXT_113C[classId] : undefined
  const parm0 = objTxt?.parm0 ?? CANONICAL_113C_OBJECTS[classId]?.parm0 ?? 0
  const levelId = Math.max(1, Math.trunc(areaId || 1))

  if (parm0 === 0) {
    let code = 1
    for (let tries = 0; tries < 8; tries += 1) {
      code = 1 + rng.rand(22)
      const remapped = remapShrineCode113c(code)
      if (
        levelId >= (CANONICAL_113C_SHRINES[code]?.levelMin ?? 1) &&
        levelId >= (CANONICAL_113C_SHRINES[remapped]?.levelMin ?? 1)
      ) {
        return remapped
      }
    }
    const remapped = remapShrineCode113c(code)
    if (levelId >= (CANONICAL_113C_SHRINES[remapped]?.levelMin ?? 1)) {
      return remapped
    }
    return 1
  }

  const effectClass: 1 | 2 | 3 | 4 =
    parm0 === 1
      ? 2
      : parm0 === 2
        ? 3
        : rng.rand(10) === 0
          ? 1
          : 4
  const list = SHRINES_BY_EFFECT_CLASS_113C[effectClass]
  let code = list[0]!
  for (let tries = 0; tries < 8; tries += 1) {
    code = list[rng.rand(list.length)]!
    const remapped = remapShrineCode113c(code)
    if (
      levelId >= (CANONICAL_113C_SHRINES[code]?.levelMin ?? 1) &&
      levelId >= (CANONICAL_113C_SHRINES[remapped]?.levelMin ?? 1)
    ) {
      return remapped
    }
  }
  const remapped = remapShrineCode113c(code)
  if (levelId >= (CANONICAL_113C_SHRINES[remapped]?.levelMin ?? 1)) {
    return remapped
  }
  for (const candidate of list) {
    const candidateRemapped = remapShrineCode113c(candidate)
    if (levelId >= (CANONICAL_113C_SHRINES[candidateRemapped]?.levelMin ?? 1)) {
      return candidateRemapped
    }
  }
  return remapShrineCode113c(list[0]!)
}

/**
 * 1.13c `D2Game.dll` `0x6fc8da00` (`0x6fc8db50..0x6fc8db7e`):
 * Computes the server frame at which an operated shrine resets from `OBJMODE_OPENED (2)`
 * back to `OBJMODE_NEUTRAL (0)` (`EVENTTYPE_ENDANIM = 3`):
 * - `resetTimeMinutes > 0`: `currentFrame + resetTimeMinutes * 1200 + 1` (`imul ebx, 0x4b0; lea ecx, [eax+ebx+1]`).
 * - `resetTimeMinutes === 0`: `0` (one-shot shrine; never schedules a reset event).
 */
export function computeShrineResetFrame113c(code: number, currentFrame: number): number {
  const meta = CANONICAL_113C_SHRINES[code] ?? getShrineMeta113c(code)
  if (meta.resetTimeMinutes <= 0) return 0
  return currentFrame + meta.resetTimeMinutes * 1200 + 1
}

/**
 * Computes the `OBJMODE_OPERATING (1)` animation duration in 25 Hz game frames from
 * `Objects.txt` `FrameCnt1` (`+0xDC`) and `FrameDelta1` (`+0xFA`).
 */
export function getObjectOperatingTicks113c(classId: number): number {
  const rec = getObjectsTxtRecord113c(classId)
  const frameCnt1 = rec.frameCnt[1] ?? 0
  const frameDelta1 = rec.frameDelta[1] ?? 0
  if (frameCnt1 <= 0) return 0
  if (frameDelta1 <= 0) return frameCnt1
  return Math.round((frameCnt1 * 256) / frameDelta1)
}

/**
 * Canonical `Objects.txt` parameters shared by all 14 water wells (`OperateFn = 22`, `InitFn = 16`,
 * IDs `111, 113, 115, 118, 130, 132, 137, 138, 322, 426, 493, 498, 513, 519`):
 * - `Parm0 = 750` (regen timer frames per charge = 30s at 25fps)
 * - `Parm1 = 128` (`128 / 256 = 50%` max life/mana/stamina healed per charge)
 * - `Parm2 = 1` (`1` charge per mode stage -> `Parm2 << 1 = 2` max charges)
 * - `Parm3 = 3` (bitmask: `bit 1` = heal HP, `bit 0` = heal Mana)
 */
export const WELL_DEFAULT_PARMS_113C = Object.freeze({
  parm0: 750,
  parm1: 128,
  parm2: 1,
  parm3: 3,
} as const)

/**
 * States cured by 1.13c town healers (`0x6fcdcbe0` + `0x6fcdc920`) and water wells (`0x6fc8a560` + `0x6fcdc920`):
 * - `1` (`STATE_FREEZE`, `0x6fc8a669` / `0x6fcdcc39`)
 * - `2` (`STATE_POISON`, `0x6fc8a646` / `0x6fcdcc1b`)
 * - All 13 rows in `States.txt` where `curable === 1` (checked via D2Common ordinal #10590 in `0x6fcdc920`):
 *   `9` (`amplifydamage`), `19` (`weaken`), `23` (`dimvision`), `27` (`taunt`),
 *   `55` (`ironmaiden`), `56` (`terror`), `57` (`attract`), `58` (`lifetap`),
 *   `59` (`confuse`), `60` (`decrepify`), `61` (`lowerresist`), `113` (`defense_curse`), `114` (`blood_mana`).
 */
export const CURABLE_STATE_IDS_113C: readonly number[] = Object.freeze([
  1, 2, 9, 19, 23, 27, 55, 56, 57, 58, 59, 60, 61, 113, 114,
])

export const WELL_CURABLE_STATE_IDS_113C: readonly number[] = CURABLE_STATE_IDS_113C

/**
 * 1.13c `D2Game.dll` `0x6fc4e760` (`InitFn 16`):
 * `pObjectData->bInteractType = pObjectsTxt->dwParm[2] << 1` (`1 << 1 = 2` charges).
 */
export function computeWellInitialCharges113c(
  parm2: number = WELL_DEFAULT_PARMS_113C.parm2,
): number {
  return Math.max(0, Math.trunc(parm2)) << 1
}

/**
 * 1.13c `D2Game.dll` `0x6fc8cf4e..0x6fc8cf64` (`OperateFn 22`) and `0x6fc89d01..0x6fc89d15` (`Event 2`):
 * Maps remaining well charges `bl` to object animation mode (`0` full, `1` half-full, `2` empty)
 * when `bl <= (Parm2 << 1)` and `bl % Parm2 === 0`: `mode = 2 - (bl / Parm2)`.
 */
export function computeWellModeForCharges113c(
  charges: number,
  parm2: number = WELL_DEFAULT_PARMS_113C.parm2,
): number | undefined {
  const step = Math.trunc(parm2)
  const c = Math.trunc(charges)
  if (step <= 0 || c < 0 || c > step << 1 || c % step !== 0) return undefined
  return 2 - Math.trunc(c / step)
}

/**
 * 1.13c `D2Game.dll` `0x6fc8cf73..0x6fc8cf84` (`OperateFn 22`):
 * Schedules `Object Event 2` (`0x6fc89ca0`) at `currentFrame + Parm0 + 1` (`currentFrame + 751`).
 */
export function computeWellRegenFrame113c(
  currentFrame: number,
  parm0: number = WELL_DEFAULT_PARMS_113C.parm0,
): number {
  return Math.trunc(currentFrame) + Math.max(0, Math.trunc(parm0)) + 1
}

/**
 * 1.13c `D2Game.dll` `0x6fc8a5a1..0x6fc8a5aa` (`OBJECTS_UseWell`):
 * Computes `(maxFixed * Parm1) >> 8` (`50%` of `maxFixed` when `Parm1 = 128`).
 */
export function computeWellHealDeltaFixed113c(
  maxFixed: number,
  parm1: number = WELL_DEFAULT_PARMS_113C.parm1,
): number {
  if (maxFixed <= 0 || parm1 <= 0) return 0
  return Math.trunc((Math.trunc(maxFixed) * Math.trunc(parm1)) / 256)
}

/**
 * 1.13c `D2Game.dll` `0x6fd142d0` (`SUNITDMG_ApplyObjectTrapDamage`):
 * Rolls trap damage in `1/256` fixed-point HP against a target with current `currentHpFixed`:
 * - `minDmg256 = max(1, currentHpFixed >> 5)` (`1/32` of current life)
 * - `maxDmg256 = max(minDmg256 + 1, currentHpFixed >> 3)` (`1/8` of current life)
 * - Uniform roll in `[minDmg256, maxDmg256]` (`range = maxDmg256 - minDmg256 + 256`)
 * - Scaled by `monLvl / 100` (`D2Common.#10820`), clamped to at least `256` (`1` whole HP).
 */
export function rollObjectTrapDamage256_113c(
  currentHpFixed: number,
  monLvl: number,
  rng: { rand(max: number): number },
): number {
  const hp256 = Math.trunc(currentHpFixed)
  if (hp256 <= 0) return 0
  const minDmg256 = Math.max(1, hp256 >> 5)
  const maxDmg256 = Math.max(minDmg256 + 1, hp256 >> 3)
  const range256 = maxDmg256 - minDmg256 + 256
  const rolled256 = minDmg256 + (range256 > 0 ? rng.rand(range256) : 0)
  const effectiveMonLvl = monLvl > 0 ? Math.trunc(monLvl) : 100
  return Math.max(256, Math.trunc((rolled256 * effectiveMonLvl) / 100))
}
