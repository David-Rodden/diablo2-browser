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
    zh: '按任务日志的当前步骤指路：小地图和地面上画出路线，并给目标物件和路上的门描边。',
    en: 'Follows your quest log step by step: a route on the minimap and the ground, using your waypoints, with outlines on the objects and doors along the way.',
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
