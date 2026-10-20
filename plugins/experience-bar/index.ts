import { createTogglePlugin } from '../../src/client/plugin-host/api.ts'

export const experienceBarPlugin = createTogglePlugin({
  id: 'experience-bar',
  name: { zh: '经验条', en: 'Experience Bar' },
  description: {
    zh: '在画面顶部显示经验条、每小时经验和升级所需时间，获得经验时会飘出 +xp。',
    en: 'An XP bar at the top of the screen with experience per hour, time to the next level, and a floating +xp each time you gain some.',
  },
  port: (ctx) => ctx.xpBar,
})
