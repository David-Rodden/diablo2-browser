import { createTogglePlugin } from '../../src/client/plugin-host/api.ts'

export const lowLifeWarningPlugin = createTogglePlugin({
  id: 'low-life-warning',
  name: { zh: '低血量警告', en: 'Low-Life Warning' },
  description: {
    zh: '生命低于 40% 时屏幕边缘泛起红光，血越少脉动越快。',
    en: 'The screen edges glow red when your life drops below 40%, pulsing faster the lower it gets.',
  },
  port: (ctx) => ctx.lowLifeWarning,
})
