import type { D2WebPlugin } from '../../src/client/plugin-host/api.ts'
import { formatRunSummary, RunTimer } from './run-timer.ts'

export const runTimerPlugin: D2WebPlugin = {
  id: 'run-timer',
  name: { zh: '计时器', en: 'Run Timer' },
  description: {
    zh: '在工具栏显示本局用时、平均用时和每小时局数。点击清零。',
    en: 'Shows the current run time, average run time and runs per hour in the toolbar. Click to reset.',
  },
  defaultEnabled: true,
  activate(ctx) {
    const timer = new RunTimer()
    const observe = () => timer.observe(ctx.session.phase === 'ingame' ? ctx.session.getSnapshot().activeGameName : null, Date.now())
    const label = () => {
      const summary = timer.summary(Date.now())
      return { zh: formatRunSummary(summary, 'zh'), en: formatRunSummary(summary, 'en') }
    }
    const tooltip = { zh: '点击清零', en: 'Click to reset' }
    observe()
    const button = ctx.toolbar.addButton({ id: 'timer', label: label(), tooltip, onClick: () => (timer.reset(Date.now()), refresh()) })
    const refresh = () => {
      observe()
      button.update?.({ label: label(), tooltip })
      ctx.notifyStatusChanged()
    }
    const unsubscribe = ctx.session.onStateChange(refresh)
    const interval = setInterval(refresh, 1000)
    return {
      getStatus: () => ({ level: 'ok', text: label() }),
      deactivate: () => (clearInterval(interval), unsubscribe(), button.dispose()),
    }
  },
}
