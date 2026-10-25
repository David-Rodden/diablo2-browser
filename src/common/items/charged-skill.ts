/**
 * src/common/items/charged-skill.ts
 *
 * `item_charged_skill` (ItemStatCost stat 204, descfunc 24) tooltip line, ported from D2Client.dll 0x6FB056C2:
 *   param  = (skill << shift) | level   (shift / mask from DataTables+0xC6C / +0xC70, i.e. 6 / 0x3F)
 *   value  = (maxCharges << 8) | currentCharges
 *   text   = ModStre10b "Level" + " " + level + " " + skill name + " " + sprintf(ModStre10d "(%d/%d Charges)", cur, max)
 */
import { CANONICAL_CHI_TBL_DICT, CANONICAL_ENG_TBL_DICT } from '../data/canonical-tbl-strings.ts'

export interface ChargedSkillCharges {
  readonly current: number
  readonly max: number
}

/** Splits the packed stat 204 value (`and edi,0xFF` / `sar ecx,8` at 0x6FB056E3). */
export function decodeChargedSkillValue(packed: number): ChargedSkillCharges {
  return { current: packed & 0xff, max: packed >> 8 }
}

/** Packs current / max charges into the stat 204 value. */
export function encodeChargedSkillValue(current: number, max: number): number {
  return ((max & 0xff) << 8) | (current & 0xff)
}

/**
 * Resolves the charges of a `charged` RolledItemProp: online items carry the packed stat value in `value`;
 * Properties.txt rolls (`charged` par=skill, min=charges, max=level) are freshly created, so current = max = min.
 */
export function chargedSkillChargesOf(value: number, min: number): ChargedSkillCharges {
  if (value > 0xff) return decodeChargedSkillValue(value)
  return { current: min, max: min }
}

export function formatChargedSkill(level: number, skillName: string, charges: ChargedSkillCharges, locale: 'en' | 'zh'): string {
  const dict = locale === 'en' ? CANONICAL_ENG_TBL_DICT : CANONICAL_CHI_TBL_DICT
  const lvlStr = dict.ModStre10b ?? CANONICAL_ENG_TBL_DICT.ModStre10b
  const fmt = dict.ModStre10d ?? CANONICAL_ENG_TBL_DICT.ModStre10d
  if (lvlStr === undefined || fmt === undefined) throw new Error('charged-skill: ModStre10b/ModStre10d missing')
  let i = 0
  const counts = fmt.replace(/%d/g, () => String(i++ === 0 ? charges.current : charges.max))
  return `${lvlStr} ${level} ${skillName} ${counts}`
}
