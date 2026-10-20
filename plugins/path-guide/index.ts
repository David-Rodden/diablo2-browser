import type { D2WebPlugin, GuideMode, LocalizedText } from '../../src/client/plugin-host/api.ts'

const MODES: Record<GuideMode, { readonly option: LocalizedText; readonly status: LocalizedText }> = {
  story: { option: { zh: '全部任务', en: 'Every quest' }, status: { zh: '全部任务', en: 'Every quest' } },
  required: { option: { zh: '只做主线', en: 'Required quests only' }, status: { zh: '只做主线', en: 'Required quests' } },
}
const isMode = (value: unknown): value is GuideMode => typeof value === 'string' && value in MODES

export const pathGuidePlugin: D2WebPlugin = {
  id: 'path-guide',
  name: { zh: '路线指引', en: 'Path Guide' },
  description: {
    zh: '根据任务进度指出下一步该去哪里：小地图上画出路线和方向箭头，地面显示指引箭头，并圈出出口和路上要开的门。',
    en: 'Points you to your next quest: a route and arrow on the minimap, guide arrows on the ground, and rings around the exit and any doors on the way.',
  },
  defaultEnabled: true,
  settings: [{ kind: 'select', key: 'mode', label: { zh: '指引', en: 'Guide to' }, default: 'story', options: Object.entries(MODES).map(([value, { option }]) => ({ value, label: option })) }],
  activate(ctx) {
    const apply = () => {
      const mode = ctx.settings.get('mode')
      ctx.pathGuide.setMode(isMode(mode) ? mode : 'story')
    }
    apply()
    const unsubscribe = ctx.settings.subscribe(apply)
    return {
      getStatus: () => {
        const mode = ctx.pathGuide.getMode()
        return mode ? { level: 'ok', text: MODES[mode].status } : { level: 'warn', text: { zh: '未开启', en: 'Inactive' } }
      },
      deactivate: () => (unsubscribe(), ctx.pathGuide.setMode(null)),
    }
  },
}
