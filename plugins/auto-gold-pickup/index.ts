import type { AutoLootRules, D2WebPlugin, LocalizedText } from '../../src/client/plugin-host/api.ts'

const CATEGORIES: readonly { readonly key: keyof AutoLootRules; readonly label: LocalizedText; readonly default: boolean }[] = [
  { key: 'runes', label: { zh: '符文', en: 'Runes' }, default: true },
  { key: 'uniques', label: { zh: '暗金物品', en: 'Unique items' }, default: true },
  { key: 'sets', label: { zh: '套装物品', en: 'Set items' }, default: true },
  { key: 'charms', label: { zh: '护身符', en: 'Charms' }, default: true },
  { key: 'jewels', label: { zh: '珠宝', en: 'Jewels' }, default: true },
  { key: 'gems', label: { zh: '无瑕和完美宝石', en: 'Flawless and perfect gems' }, default: false },
  { key: 'rares', label: { zh: '稀有物品', en: 'Rare items' }, default: false },
]

export const autoGoldPickupPlugin: D2WebPlugin = {
  id: 'auto-gold-pickup',
  name: { zh: '自动拾取', en: 'Auto Pickup' },
  description: {
    zh: '自动捡起附近的金币和你选的好东西（符文、暗金、套装等），会绕墙开门走过去，背包放不下就不捡。',
    en: "Picks up gold and the loot you choose (runes, uniques, sets and more) near you, walking around walls and opening doors to reach it. Skips anything your inventory has no room for.",
  },
  defaultEnabled: false,
  settings: [
    { kind: 'boolean', key: 'gold', label: { zh: '金币', en: 'Gold' }, default: true },
    ...CATEGORIES.map(({ key, label, default: value }) => ({ kind: 'boolean' as const, key, label, default: value })),
  ],
  activate(ctx) {
    const apply = () => {
      ctx.autoGoldPickup.setEnabled(ctx.settings.get('gold') === true)
      ctx.autoLoot.setRules(Object.fromEntries(CATEGORIES.map(({ key }) => [key, ctx.settings.get(key) === true])) as unknown as AutoLootRules)
    }
    apply()
    const unsubscribe = ctx.settings.subscribe(apply)
    return {
      getStatus: () => {
        const rules = ctx.autoLoot.getRules()
        const picked = [ctx.autoGoldPickup.isEnabled() ? 'gold' : null, ...CATEGORIES.filter(({ key }) => rules?.[key]).map(({ label }) => label.en.toLowerCase())].filter(Boolean)
        return picked.length > 0 ? { level: 'ok', text: { zh: '已开启', en: `Picking up ${picked.join(', ')}` } } : { level: 'warn', text: { zh: '没有选择任何物品', en: 'Nothing selected' } }
      },
      deactivate: () => {
        unsubscribe()
        ctx.autoGoldPickup.setEnabled(false)
        ctx.autoLoot.setRules(null)
      },
    }
  },
}
