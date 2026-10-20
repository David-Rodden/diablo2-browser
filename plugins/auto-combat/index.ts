import type { D2WebPlugin } from '../../src/client/plugin-host/api.ts'

const KEYS = ['E', 'D', 'F', 'G', 'X', 'SPACE'] as const

export const autoCombatPlugin: D2WebPlugin = {
  id: 'auto-combat',
  name: { zh: '自动战斗', en: 'Auto-Fight' },
  description: {
    zh: '按设定的按键开关。开启后自动攻击画面内最近、能走到的敌人，绕开墙后的怪物，路上遇到关着的门会先打开。',
    en: "Press the hotkey to switch it on or off. While it's on, you attack the nearest monster you can walk to, skip ones behind walls, and open doors on the way.",
  },
  defaultEnabled: false,
  settings: [
    {
      kind: 'select',
      key: 'key',
      label: { zh: '按键', en: 'Key' },
      default: 'E',
      options: KEYS.map((key) => ({ value: key, label: key === 'SPACE' ? { zh: '空格', en: 'Space' } : { zh: key, en: key } })),
    },
  ],
  activate(ctx) {
    const apply = () => ctx.autoCombat.setKey(String(ctx.settings.get('key') || 'E'))
    apply()
    const unsubscribe = ctx.settings.subscribe(apply)
    return {
      getStatus: () => {
        const key = ctx.autoCombat.getKey()
        return key ? { level: 'ok', text: { zh: `按 ${key} 开关`, en: `Press ${key} to toggle` } } : { level: 'warn', text: { zh: '未开启', en: 'Inactive' } }
      },
      deactivate: () => {
        unsubscribe()
        ctx.autoCombat.setKey(null)
      },
    }
  },
}
