import { describe, expect, it } from 'vitest'
import { characterBuild } from '../../src/common/items/character-build.ts'
import { runewordsFor } from '../../src/common/items/runeword-advice.ts'
import { baseFor, nextSocketMove, runewordKit } from '../../src/client/guide/socket-plan.ts'
import type { ItemData } from '../../src/netproto/index.ts'

const item = (fields: Partial<ItemData> & { readonly id: number; readonly code: string }): ItemData =>
  ({ itemId: fields.id, rawCode: fields.code, quality: 2, identified: true, stats: [], runewordStats: [], setBonusStats: [], totalSockets: 0, usedSockets: 0, socketedChildCount: 0, runeword: false, invWidth: 1, invHeight: 1, bodyLoc: 0, equippedSlot: 0, flags: 0, rawFlags: 0, container: 'inventory', ...fields }) as ItemData

const barb = characterBuild({ classIndex: 4, level: 24, strength: 60, dexterity: 30, skillPoints: new Map([[126, 10], [139, 5]]) })
const stock = (equipment: ItemData[], inventory: ItemData[], sockets = new Map<number, ItemData[]>()) => ({ equipment, inventory, sockets })

describe('socketing', () => {
  it('puts the gem that helps most into an open socket on worn gear, and nothing into full sockets', () => {
    const helm = item({ id: 1, code: 'cap', quality: 4, totalSockets: 1, bodyLoc: 1, container: 'equipment' })
    const [ruby, chipped] = [item({ id: 10, code: 'gpr' }), item({ id: 11, code: 'gcr' })]
    expect(nextSocketMove(stock([helm], [chipped, ruby]), barb)).toMatchObject({ filler: { id: 10 }, target: { id: 1 } })
    expect(nextSocketMove(stock([{ ...helm, usedSockets: 1 }], [ruby]), barb)).toBeNull()
  })

  it('builds a runeword rune by rune when it owns a fitting base and every rune', () => {
    const pick = runewordsFor(barb).find((rw) => !rw.forMerc && rw.runes.length === 2 && rw.levelreq <= barb.level && rw.itypes.includes('swor'))!
    const armor = item({ id: 2, code: 'ssd', quality: 2, totalSockets: 2, bodyLoc: 4, container: 'equipment' })
    const runes = pick.runes.map((code, i) => item({ id: 20 + i, code }))
    expect(nextSocketMove(stock([armor], [...runes].reverse()), barb)).toMatchObject({ filler: { code: pick.runes[0] }, target: { id: 2 } })
    expect(nextSocketMove(stock([armor], [runes[1]!]), barb)).toBeNull()
    expect(nextSocketMove(stock([armor], [runes[1]!], new Map([[2, [runes[0]!]]])), barb)).toMatchObject({ filler: { id: 21 } })
  })

  it('gathers a runeword it holds every rune for, and knows when it still needs a base', () => {
    const paladin = characterBuild({ classIndex: 3, level: 34, strength: 60, dexterity: 40, skillPoints: new Map([[112, 15], [113, 10]]) })
    const spirit = runewordsFor(paladin).find((rw) => rw.name === 'Spirit')!
    const runes = spirit.runes.map((code, i) => item({ id: 30 + i, code, container: 'stash' }))
    const kit = runewordKit(runes, new Map(), paladin)
    expect(kit).toMatchObject({ name: 'Spirit', base: null })
    expect(kit!.runes.map((rune) => rune.id)).toEqual([30, 31, 32, 33])
    expect(runewordKit(runes.slice(1), new Map(), paladin)).toBeNull()
    const [crystal, tooFew, magic, giant] = [item({ id: 40, code: 'crs', totalSockets: 4 }), item({ id: 41, code: 'crs', totalSockets: 3 }), item({ id: 42, code: 'crs', totalSockets: 4, quality: 4 }), item({ id: 43, code: 'gis', totalSockets: 4 })]
    expect(baseFor(kit!, [tooFew, magic, giant, crystal], new Map(), paladin)?.id).toBe(40)
    expect(runewordKit([...runes, crystal], new Map(), paladin)?.base?.id).toBe(40)
  })
})
