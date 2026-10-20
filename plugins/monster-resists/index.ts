import { createTogglePlugin } from '../../src/client/plugin-host/api.ts'

export const monsterResistsPlugin = createTogglePlugin({
  id: 'monster-resists',
  name: { zh: '怪物抗性', en: 'Monster Resists' },
  description: {
    zh: '悬停怪物时在血条下显示它的全部抗性。',
    en: "Shows all of a monster's resistances under its health bar, not just immunities.",
  },
  port: (ctx) => ctx.monsterResists,
})
