import type { D2WebPlugin } from '../../src/client/plugin-host/api.ts'
import { lootAlert, type AlertLevel, type DroppedItem } from './alerts.ts'

export const lootAlertsPlugin: D2WebPlugin = {
  id: 'loot-alerts',
  name: { zh: '掉落提醒', en: 'Loot Alerts' },
  description: {
    zh: '怪物掉落暗金、套装、符文等好东西时，在屏幕上方弹出提示。',
    en: 'Pops a banner at the top of the screen when a monster drops a unique, set item, rune or other good loot.',
  },
  defaultEnabled: true,
  settings: [
    {
      kind: 'select',
      key: 'level',
      label: { zh: '提醒哪些', en: 'Announce' },
      default: 'notable',
      options: [
        { value: 'notable', label: { zh: '暗金、套装、符文', en: 'Uniques, sets and runes' } },
        { value: 'valuable', label: { zh: '再加稀有、护身符、珠宝、完美宝石', en: 'Also rares, charms, jewels and perfect gems' } },
        { value: 'runes', label: { zh: '只提醒符文', en: 'Runes only' } },
      ],
    },
  ],
  activate(ctx) {
    const announced = new Set<number>()
    const unsubscribe = ctx.session.onServerEvent((ev) => {
      if (ev.type !== 'ItemEvent' || ev.container !== 'ground' || typeof ev.action !== 'number') return
      const item = ev.item as DroppedItem | undefined
      if (!item || announced.has(item.id)) return
      const toast = lootAlert(ev.action, item, ctx.settings.get('level') as AlertLevel, ctx.session.world.areaId)
      if (toast === null) return
      announced.add(item.id)
      ctx.notify.show(toast)
    })
    const unsubscribeState = ctx.session.onStateChange((snap) => void (snap.phase !== 'ingame' && announced.clear()))
    return { deactivate: () => [unsubscribe, unsubscribeState].forEach((off) => off()) }
  },
}
