import { createTogglePlugin } from '../../src/client/plugin-host/api.ts'

export const monsterLevelPlugin = createTogglePlugin({
  id: 'monster-level',
  author: 'David-Rodden',
  name: { zh: '怪物等级', en: 'Monster Level' },
  description: {
    zh: '悬停怪物时在名字旁显示它的等级，精英和头目的加成也算在内。（作者：David-Rodden，感谢贡献！）',
    en: "Shows a monster's level next to its name when you hover it, counting the extra levels champions, uniques and their minions get. (Author: David-Rodden — Special thanks for contributing!)",
  },
  port: (ctx) => ctx.monsterLevel,
})
