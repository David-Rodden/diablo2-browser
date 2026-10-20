import { createTogglePlugin } from '../../src/client/plugin-host/api.ts'

export const stashDepositAllPlugin = createTogglePlugin({
  id: 'stash-deposit-all',
  name: { zh: '一键存入仓库', en: 'Stash: Deposit All' },
  description: {
    zh: '在仓库添加“全部存入”按钮，存入背包物品和金币。护身符、卷轴书和方块留在背包。',
    en: 'Adds a Deposit All button to the stash that moves your inventory and gold in. Charms, tomes and the Cube stay with you.',
  },
  port: (ctx) => ctx.stashDepositAll,
})
