import { classifyObjectOperate113c } from '../../common/world/object-operate-113c.ts'
import { isObjectSelectableInMode, resolveObjectDisplayName } from '../../common/world/objects-meta.ts'
import type { ClientUnit } from '../world/client-unit.ts'
import AREA from './data/environment.json'

export interface Bearing {
  readonly life: number
  readonly mana: number
  readonly states: ReadonlySet<number>
  readonly looting: boolean
}

interface Restore {
  readonly code: number
  readonly life?: boolean
  readonly mana?: boolean
}

interface Buff {
  readonly code: number
  readonly state?: number
  readonly rank: number
}

const RESTORES = Object.entries(AREA.restores as Readonly<Record<string, Restore>>)
const BUFFS = Object.entries(AREA.buffs as Readonly<Record<string, Buff>>)

export const ENVIRONMENT = AREA

const shrineCode = (unit: ClientUnit) => ((unit.interactType ?? 0) > 0 ? unit.interactType! : unit.flags)

export const buffRank = (states: ReadonlySet<number>) => Math.max(0, ...BUFFS.filter(([, buff]) => buff.state !== undefined && states.has(buff.state)).map(([, buff]) => buff.rank))

export function worthUsing(unit: ClientUnit, me: Bearing): string | null {
  if (unit.unitType !== 'object' || !isObjectSelectableInMode(unit.classId, unit.mode)) return null
  const hurt = me.life < AREA.hurt
  const dry = me.mana < AREA.dry
  const kind = classifyObjectOperate113c(unit.classId)
  if (kind === 'well') return hurt || dry ? 'Drinking from the well' : null
  if (kind === 'container') return me.looting ? `Opening the ${resolveObjectDisplayName(unit.classId, unit.mode)?.name ?? 'chest'}` : null
  if (kind !== 'shrine') return null
  const code = shrineCode(unit)
  const restore = RESTORES.find(([, shrine]) => shrine.code === code)
  if (restore) return (restore[1].life && hurt) || (restore[1].mana && dry) ? `Using the ${restore[0]}` : null
  const buff = BUFFS.find(([, shrine]) => shrine.code === code)
  return buff && buff[1].rank > buffRank(me.states) ? `Using the ${buff[0]}` : null
}
