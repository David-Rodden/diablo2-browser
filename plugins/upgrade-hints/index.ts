import { createTogglePlugin } from '../../src/client/plugin-host/api.ts'

export const upgradeHintsPlugin = createTogglePlugin({
  id: 'upgrade-hints',
  name: { zh: '装备提升标记', en: 'Upgrade Markers' },
  description: {
    zh: '与当前装备比较：绿色箭头表示更好，两个箭头表示好得多，黄色空心箭头表示有得有失或未鉴定。',
    en: "Compares items with what you're wearing: a green arrow means better, two arrows much better, and a hollow yellow arrow means it's a trade-off or unidentified.",
  },
  port: (ctx) => ctx.upgradeHints,
})
