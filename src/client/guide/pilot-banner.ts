export interface PilotBannerState {
  readonly shown: boolean
  readonly status: string | null
  readonly hint: string | null
}

const REFRESH_MS = 250
const mounted = new WeakMap<HTMLElement, () => void>()

export function mountPilotBanner(stage: HTMLElement, read: () => PilotBannerState): void {
  mounted.get(stage)?.()
  const banner = document.createElement('div')
  banner.className = 'd2-pilot-banner'
  banner.style.cssText =
    'position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:30;pointer-events:none;padding:3px 10px;border:1px solid #6b5a2e;background:rgba(0,0,0,0.72);color:#c7b377;font:12px/1.35 serif;text-align:center;white-space:nowrap;display:none'
  const [status, hint] = [document.createElement('div'), document.createElement('div')]
  status.style.color = '#3cdc3c'
  banner.append(status, hint)
  stage.appendChild(banner)
  const timer = setInterval(() => {
    const state = read()
    banner.style.display = state.shown && state.status ? 'block' : 'none'
    status.textContent = state.status ? `Autopilot: ${state.status}` : ''
    hint.textContent = state.hint ?? ''
  }, REFRESH_MS)
  mounted.set(stage, () => {
    clearInterval(timer)
    banner.remove()
  })
}
