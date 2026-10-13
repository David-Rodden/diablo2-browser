import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import { MountedArchives } from '../src/common/mpq/mount.ts'
import { MpqArchive } from '../src/common/mpq/archive.ts'
import { fileSource } from '../src/baker/io/file-source.ts'
import { encodeTbl } from '../src/baker/io/tbl-writer.ts'
import { decodeTbl } from '../src/common/formats/tbl.ts'
import type { DecodedTbl } from '../src/common/formats/tbl.ts'
import { loadArmor } from '../src/common/items/armor.ts'
import { loadWeapons } from '../src/common/items/weapons.ts'
import { loadMisc } from '../src/common/items/misc-items.ts'
import { loadUniqueItems } from '../src/common/items/unique-items.ts'
import { loadSetData } from '../src/common/items/set-items.ts'
import {
  StringTableChain,
  ENG_STRING_TABLE_PATHS,
  CHI_STRING_TABLE_PATHS,
  loadStringTableChain,
  loadItemNameChains,
  resolveItemName,
  resolveArmorName,
  resolveWeaponName,
  resolveMiscName,
  resolveUniqueName,
  resolveUniqueItemName,
  resolveSetItemName,
  resolveSetName,
  resolveRunewordName,
  resolveRuneName,
  resolveAffixName,
} from '../src/common/items/item-names.ts'

const hasD2 = fs.existsSync('samples/d2/d2data.mpq')

function createSyntheticTable(entries: Record<string, string>): DecodedTbl {
  const tblEntries = Object.entries(entries).map(([key, value]) => ({ key, value }))
  const encoded = encodeTbl(tblEntries)
  return decodeTbl(encoded, 'utf-8')
}

describe('Item Names Localization (Issue #108)', () => {
  describe('Hermetic Unit Tests', () => {
    it('verifies path constants for ENG and CHI chains', () => {
      expect(ENG_STRING_TABLE_PATHS).toEqual([
        'data\\local\\LNG\\ENG\\patchstring.tbl',
        'data\\local\\LNG\\ENG\\expansionstring.tbl',
        'data\\local\\lng\\eng\\string.tbl',
      ])
      expect(CHI_STRING_TABLE_PATHS).toEqual([
        'data\\local\\LNG\\CHI\\patchstring.tbl',
        'data\\local\\LNG\\CHI\\string.tbl',
      ])
    })

    it('implements three-tier lookup hierarchy: patch > expansion > base', () => {
      const baseTbl = createSyntheticTable({
        key1: 'base1',
        key2: 'base2',
        key3: 'base3',
      })
      const expTbl = createSyntheticTable({
        key2: 'exp2',
        key4: 'exp4',
      })
      const patchTbl = createSyntheticTable({
        key1: 'patch1',
      })

      const chain = new StringTableChain('ENG', [patchTbl, expTbl, baseTbl])

      // patch overrides base
      expect(chain.get('key1')).toBe('patch1')
      // expansion overrides base
      expect(chain.get('key2')).toBe('exp2')
      // base is returned when neither patch nor expansion has it
      expect(chain.get('key3')).toBe('base3')
      // expansion-only entry
      expect(chain.get('key4')).toBe('exp4')
      // non-existent
      expect(chain.get('unknown')).toBeUndefined()

      // has() check
      expect(chain.has('key1')).toBe(true)
      expect(chain.has('key4')).toBe(true)
      expect(chain.has('missing')).toBe(false)

      // dict getter check
      expect(chain.dict.get('key1')).toBe('patch1')
      expect(chain.dict.get('key2')).toBe('exp2')
      expect(chain.dict.get('key3')).toBe('base3')
      expect(chain.dict.get('key4')).toBe('exp4')

      // iterable
      expect([...chain].length).toBe(3)
    })

    it('implements language fallback: CHI -> ENG -> code fallback', () => {
      const chiTbl = createSyntheticTable({
        cap: '帽子',
        unique_shared: 'CHI版本',
      })
      const engTbl = createSyntheticTable({
        cap: 'Cap',
        unique_shared: 'ENG Version',
        r33: 'Zod Rune',
      })

      const chiChain = new StringTableChain('CHI', [chiTbl])
      const engChain = new StringTableChain('ENG', [engTbl])

      // Both CHI and ENG present -> CHI wins
      expect(resolveItemName('cap', chiChain, engChain)).toBe('帽子')
      expect(resolveItemName('unique_shared', chiChain, engChain)).toBe('CHI版本')

      // Absent in CHI, present in ENG -> ENG fallback
      expect(resolveItemName('r33', chiChain, engChain)).toBe('Zod Rune')

      // Absent in both -> raw code fallback
      expect(resolveItemName('hpo', chiChain, engChain)).toBe('hpo')
      expect(resolveItemName('nonexistent_key', chiChain, engChain)).toBe('nonexistent_key')

      // Only ENG chain provided
      expect(resolveItemName('cap', undefined, engChain)).toBe('Cap')
      expect(resolveItemName('cap', null, engChain)).toBe('Cap')

      // Neither chain provided
      expect(resolveItemName('cap', undefined, undefined)).toBe('cap')

      // Empty / falsy key returns empty string
      expect(resolveItemName('', chiChain, engChain)).toBe('')
    })

    it('supports ItemNameChains composite object parameter', () => {
      const chiChain = new StringTableChain('CHI', [createSyntheticTable({ tow: '塔盾' })])
      const engChain = new StringTableChain('ENG', [createSyntheticTable({ tow: 'Tower Shield' })])

      expect(resolveItemName('tow', { chi: chiChain, eng: engChain })).toBe('塔盾')
      expect(resolveItemName('tow', { eng: engChain })).toBe('Tower Shield')
    })

    it('tests specific resolver helpers with object and string inputs', () => {
      const chiChain = new StringTableChain('CHI', [
        createSyntheticTable({
          cap: '帽子',
          hax: '手斧',
          hp1: '微型治療藥劑',
          'The Gnasher': '牙齒',
          "Civerb's Ward": '希弗柏的防護',
          "Civerb's Vestments": '希弗伯的法衣',
          Runeword26: '末日',
          r01: '艾爾',
        }),
      ])
      const engChain = new StringTableChain('ENG', [
        createSyntheticTable({
          cap: 'Cap',
          hax: 'Hand Axe',
          hp1: 'Minor Healing Potion',
          'The Gnasher': 'The Gnasher',
          "Civerb's Ward": "Civerb's Ward",
          "Civerb's Vestments": "Civerb's Vestments",
          Runeword26: 'Doom',
          r01: 'El Rune',
        }),
      ])

      // Armor resolver helper (namestr)
      expect(resolveArmorName('cap', chiChain, engChain)).toBe('帽子')
      expect(resolveArmorName({ namestr: 'cap' }, chiChain, engChain)).toBe('帽子')

      // Weapon resolver helper (namestr)
      expect(resolveWeaponName('hax', chiChain, engChain)).toBe('手斧')
      expect(resolveWeaponName({ namestr: 'hax' }, chiChain, engChain)).toBe('手斧')

      // Misc resolver helper (namestr)
      expect(resolveMiscName('hp1', chiChain, engChain)).toBe('微型治療藥劑')
      expect(resolveMiscName({ namestr: 'hp1' }, chiChain, engChain)).toBe('微型治療藥劑')

      // Unique resolver helper (index)
      expect(resolveUniqueName('The Gnasher', chiChain, engChain)).toBe('牙齒')
      expect(resolveUniqueName({ index: 'The Gnasher' }, chiChain, engChain)).toBe('牙齒')
      expect(resolveUniqueItemName({ index: 'The Gnasher' }, chiChain, engChain)).toBe('牙齒')

      // Set item resolver helper (index)
      expect(resolveSetItemName("Civerb's Ward", chiChain, engChain)).toBe('希弗柏的防護')
      expect(resolveSetItemName({ index: "Civerb's Ward" }, chiChain, engChain)).toBe('希弗柏的防護')

      // Set resolver helper (name)
      expect(resolveSetName("Civerb's Vestments", chiChain, engChain)).toBe('希弗伯的法衣')
      expect(resolveSetName({ name: "Civerb's Vestments" }, chiChain, engChain)).toBe('希弗伯的法衣')

      // Runeword resolver helper (Name)
      expect(resolveRunewordName('Runeword26', chiChain, engChain)).toBe('末日')
      expect(resolveRunewordName({ Name: 'Runeword26' }, chiChain, engChain)).toBe('末日')
      expect(resolveRunewordName({ name: 'Runeword26' }, chiChain, engChain)).toBe('末日')

      // Rune resolver helper (namestr / code)
      expect(resolveRuneName('r01', chiChain, engChain)).toBe('艾爾')
      expect(resolveRuneName({ namestr: 'r01' }, chiChain, engChain)).toBe('艾爾')
      expect(resolveRuneName({ code: 'r01' }, chiChain, engChain)).toBe('艾爾')
    })

    it('verifies Magic/Rare affix names return raw text without querying TBL', () => {
      // Magic and rare affix text must be preserved verbatim without TBL query
      expect(resolveAffixName('Cruel')).toBe('Cruel')
      expect(resolveAffixName({ name: "of the Whale" })).toBe("of the Whale")
      expect(resolveAffixName({ Name: "Grandmaster's" })).toBe("Grandmaster's")
      expect(resolveAffixName({ name: 'Beast' })).toBe('Beast')
      expect(resolveAffixName({ name: 'flange' })).toBe('flange')
    })

    it('handles simulated MountedArchives with missing tables', async () => {
      const mockArchive = {
        has(name: string) {
          const lower = name.toLowerCase()
          return lower.includes('patchstring') || lower.endsWith('\\string.tbl') || lower.endsWith('/string.tbl')
        },
        async read(name: string) {
          const lower = name.toLowerCase()
          if (lower.includes('patchstring')) {
            return encodeTbl([{ key: 'p_key', value: 'PatchVal' }])
          }
          if (lower.endsWith('\\string.tbl') || lower.endsWith('/string.tbl')) {
            return encodeTbl([{ key: 'b_key', value: 'BaseVal' }])
          }
          throw new Error('file not found')
        },
      }

      const chain = await loadStringTableChain(mockArchive as unknown as MountedArchives, 'ENG')
      expect(chain.tables.length).toBe(2)
      expect(chain.get('p_key')).toBe('PatchVal')
      expect(chain.get('b_key')).toBe('BaseVal')
    })
  })

  describe.skipIf(!hasD2)('1.13c MPQ Integration Tests (samples/d2)', () => {
    let archives: MountedArchives
    let engChain: StringTableChain
    let chiChain: StringTableChain

    beforeAll(async () => {
      archives = new MountedArchives()
      for (const name of ['d2data.mpq', 'd2exp.mpq', 'Patch_D2.mpq']) {
        archives.add(name, await MpqArchive.open(await fileSource(`samples/d2/${name}`)))
      }
      const loaded = await loadItemNameChains(archives)
      engChain = loaded.eng
      chiChain = loaded.chi
    })

    it('loads 3 tables for ENG chain and 2 tables for CHI chain', () => {
      expect(engChain.tables.length).toBe(3)
      expect(chiChain.tables.length).toBe(2)
      expect(engChain.lang).toBe('ENG')
      expect(chiChain.lang).toBe('CHI')
    })

    it('asserts ENG coverage on mounted MPQs: Armor 202/202, Weapons 306/306, Misc 143/151', async () => {
      // Armor coverage: 202/202
      const armor = await loadArmor(archives)
      expect(armor.all.length).toBe(202)
      let armorHits = 0
      for (const a of armor.all) {
        if (engChain.has(a.namestr)) armorHits++
      }
      expect(armorHits).toBe(202)

      // Weapons coverage: 306/306
      const weapons = await loadWeapons(archives)
      expect(weapons.all.length).toBe(306)
      let weaponHits = 0
      for (const w of weapons.all) {
        if (engChain.has(w.namestr)) weaponHits++
      }
      expect(weaponHits).toBe(306)

      // Misc coverage: 143/151 (8 unused placeholder potions like hpo, mpo are unmapped)
      const misc = await loadMisc(archives)
      expect(misc.all.length).toBe(151)
      let miscHits = 0
      const unmapped: string[] = []
      for (const m of misc.all) {
        if (engChain.has(m.namestr)) {
          miscHits++
        } else {
          unmapped.push(m.code)
        }
      }
      expect(miscHits).toBe(143)
      expect(unmapped).toEqual(['hpo', 'mpo', 'hpf', 'mpf', 'rps', 'rpl', 'bps', 'bpl'])
    })

    it('asserts CHI UTF-8 decoding: cap -> 帽子, tow -> 塔盾, axe -> 斧', () => {
      expect(resolveArmorName('cap', chiChain, engChain)).toBe('帽子')
      expect(resolveArmorName('tow', chiChain, engChain)).toBe('塔盾')
      expect(resolveWeaponName('axe', chiChain, engChain)).toBe('斧')

      // Also verify via direct resolveItemName
      expect(resolveItemName('cap', chiChain, engChain)).toBe('帽子')
      expect(resolveItemName('tow', chiChain, engChain)).toBe('塔盾')
      expect(resolveItemName('axe', chiChain, engChain)).toBe('斧')
    })

    it('asserts fallback to ENG when absent in CHI: r33 (Zod Rune), Windforce, Annihilus', async () => {
      // r33 (Zod Rune from Misc.txt)
      expect(chiChain.get('r33')).toBeUndefined()
      expect(engChain.get('r33')).toBe('Zod Rune')
      expect(resolveItemName('r33', chiChain, engChain)).toBe('Zod Rune')
      expect(resolveRuneName('r33', chiChain, engChain)).toBe('Zod Rune')

      // Windforce (Unique hydra bow from UniqueItems.txt)
      expect(chiChain.get('Windforce')).toBeUndefined()
      expect(engChain.get('Windforce')).toBe('Windforce')
      expect(resolveItemName('Windforce', chiChain, engChain)).toBe('Windforce')
      expect(resolveUniqueName('Windforce', chiChain, engChain)).toBe('Windforce')

      // Annihilus (Unique small charm from UniqueItems.txt)
      expect(chiChain.get('Annihilus')).toBeUndefined()
      expect(engChain.get('Annihilus')).toBe('Annihilus')
      expect(resolveItemName('Annihilus', chiChain, engChain)).toBe('Annihilus')
      expect(resolveUniqueName('Annihilus', chiChain, engChain)).toBe('Annihilus')
    })

    it('asserts Uniques: The Gnasher -> ENG "The Gnasher" / CHI "牙齒"', async () => {
      const uniques = await loadUniqueItems(archives)
      const gnasher = uniques.byIndex.get('The Gnasher')
      expect(gnasher).toBeDefined()

      expect(resolveUniqueName('The Gnasher', undefined, engChain)).toBe('The Gnasher')
      expect(resolveUniqueName('The Gnasher', chiChain, engChain)).toBe('牙齒')
      expect(resolveUniqueName(gnasher!, chiChain, engChain)).toBe('牙齒')
    })

    it("asserts Sets: Civerb's Ward -> CHI '希弗柏的防護'", async () => {
      const setData = await loadSetData(archives)
      const ward = setData.items.getByIndex("Civerb's Ward")
      expect(ward).toBeDefined()

      expect(resolveSetItemName("Civerb's Ward", undefined, engChain)).toBe("Civerb's Ward")
      expect(resolveSetItemName("Civerb's Ward", chiChain, engChain)).toBe('希弗柏的防護')
      expect(resolveSetItemName(ward!, chiChain, engChain)).toBe('希弗柏的防護')

      // Also check Sets.txt name resolution
      const vestments = setData.sets.getByIndex("Civerb's Vestments")
      expect(vestments).toBeDefined()
      expect(resolveSetName(vestments!, chiChain, engChain)).toBe('希弗伯的法衣')
    })

    it('asserts Runeword: Runeword26 -> "Doom"', () => {
      expect(engChain.get('Runeword26')).toBe('Doom')
      expect(chiChain.get('Runeword26')).toBeUndefined()
      expect(resolveRunewordName('Runeword26', chiChain, engChain)).toBe('Doom')
      expect(resolveRunewordName({ Name: 'Runeword26' }, chiChain, engChain)).toBe('Doom')
    })

    it('verifies namestr vs name distinction (e.g. hp1)', async () => {
      const misc = await loadMisc(archives)
      const hp1 = misc.byCode.get('hp1')
      expect(hp1).toBeDefined()

      // The raw table name is 'Lesser Healing Potion', but namestr is 'hp1'
      expect(hp1?.name).toBe('Lesser Healing Potion')
      expect(hp1?.namestr).toBe('hp1')

      // namestr resolves to 'Minor Healing Potion' in ENG and '輕微治療葯劑' in CHI
      expect(resolveMiscName(hp1!, undefined, engChain)).toBe('Minor Healing Potion')
      expect(resolveMiscName(hp1!, chiChain, engChain)).toBe('輕微治療葯劑')
    })
  })
})
