import { createTogglePlugin } from '../../src/client/plugin-host/api.ts'

export const beltRefillPlugin = createTogglePlugin({
  id: 'belt-refill',
  name: { zh: '自动补充腰带', en: 'Belt Refill' },
  description: {
    zh: '腰带有空位时，从背包里拿药补上。每一列补回原来那种药，空着的列先放腰带里缺的药。',
    en: 'Refills your belt from the inventory. Each column gets back the kind of potion it held, and an empty column takes whatever kind the belt is missing.',
  },
  defaultEnabled: false,
  port: (ctx) => ctx.beltRefill,
})
