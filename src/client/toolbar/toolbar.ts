import {
  getGameLang,
  onLangChange,
  setLang,
  tToolbar,
  type GameLang,
} from '../i18n/lang.ts'
import {
  TOOLBAR_DROP_TRACKER_ICON_SVG,
  TOOLBAR_KILL_STATS_ICON_SVG,
  resolveLocalizedText,
  type ToolbarContributionHandle,
  type ToolbarContributionPatch,
} from '../plugin-host/api.ts'
import type { ToolbarContributionSpec } from '../plugin-host/plugin-host.ts'
import {
  VALID_VIEWPORT_RESOLUTIONS,
  validateServerHost,
  type AutomapRevealMode,
  type ClientLightingPreset,
  type ClientSettings,
  type ServerHostValidationResult,
  type ViewportResolution,
} from '../settings/client-settings.ts'
import { getGlobalSettingsStore, type SettingsStore } from '../settings/settings-store.ts'
import { FullscreenController, type FullscreenDocLike } from './fullscreen-controller.ts'
import {
  clearClientAssetCache,
  formatCacheBytesMb,
} from '../sw/register.ts'
import {
  NATIVE_113C_VIEWPORT_RESOLUTIONS,
  formatViewportLabel,
  getViewportProfile,
  type ViewportProfile,
} from '../view/viewport-profile.ts'

export type ToolbarConnectionPhase =
  | 'disconnected'
  | 'connecting'
  | 'bncs'
  | 'mcp'
  | 'd2gs'
  | 'error'

export type ToolbarDiagnosticKind =
  | 'none'
  | 'quota_exceeded'
  | 'tls_error'
  | 'bare_ip_on_https'
  | 'invalid_host'
  | 'custom'

export interface ToolbarConnectionState {
  readonly phase: ToolbarConnectionPhase
  readonly rttMs: number | null
  readonly diagnosticKind?: ToolbarDiagnosticKind | undefined
  readonly diagnosticMessage?: string | undefined
}

export interface ToolbarCallbacks {
  readonly onServerHostReconnect?: ((newHost: string, prevHost: string) => void) | undefined
  readonly onLangChange?: ((lang: GameLang) => void) | undefined
  readonly onLightingChange?: ((preset: ClientLightingPreset) => void) | undefined
  readonly onAutomapRevealChange?: ((mode: AutomapRevealMode) => void) | undefined
  readonly onViewportChange?: ((profile: ViewportProfile) => void) | undefined
  readonly onPluginsToggle?: (() => void) | undefined
  readonly onClearCache?: (() => void | Promise<void>) | undefined
  /** Fullscreen enter/exit failed (default: `console.error`). */
  readonly onFullscreenError?: ((message: string) => void) | undefined
}

export interface ToolbarOptions {
  readonly store?: SettingsStore | undefined
  readonly container?: HTMLElement | null | undefined
  readonly pageProtocol?: string | undefined
  readonly allowedViewports?: readonly ViewportResolution[] | undefined
  readonly confirmReconnect?: ((message: string) => boolean) | undefined
  readonly callbacks?: ToolbarCallbacks | undefined
}

export interface ToolbarSnapshot {
  readonly connection: ToolbarConnectionState
  readonly settings: ClientSettings
  readonly viewportProfile: ViewportProfile
  readonly allowedViewports: readonly ViewportResolution[]
  readonly statusLabel: string
  readonly rttLabel: string
  readonly diagnosticBannerText: string | null
  readonly serverInputValue: string
  readonly serverInputValid: boolean
}

interface ContributionEntry {
  spec: ToolbarContributionSpec
  readonly el: HTMLElement | null
  readonly iconEl: HTMLElement | null
  readonly labelEl: HTMLElement | null
  readonly selectEl: HTMLSelectElement | null
}

const DROP_BADGE_PATTERN =
  /^(掉落\s+|Drops\s+)(绿\d+|S:\d+)(\s*·\s*)(金\d+|U:\d+)(\s*·\s*)(符\d+|R:\d+)$/

/**
 * Persistent 32px Top DOM Toolbar (`#d2-toolbar`) with primary controls:
 * 1. Connection Status + RTT (`ms`) + Diagnostics (5-per-IP quota / WSS TLS error) + Plugins modal button (`#d2-toolbar-plugins-btn`) + Dynamic Plugin Contribution Slot (`#d2-toolbar-plugin-slot`)
 * 2. Live Language Toggle (`中` / `EN`)
 * 3. Viewport Size Selector (`#d2-toolbar-viewport-select`, native 1.13c `640x480 | 800x600` by default, extensible via `extended-viewports` plugin) + Asset Cache Clear button
 */
export const TOOLBAR_PLUGINS_ICON_SVG =
  '<svg class="d2-toolbar__icon-svg" viewBox="0 0 16 16" width="12" height="12" fill="currentColor" focusable="false" aria-hidden="true"><path d="M4 5h1.5v-.5a1.5 1.5 0 0 1 3 0V5H10a1 1 0 0 1 1 1v1.5h.5a1.5 1.5 0 0 1 0 3H11V12a1 1 0 0 1-1 1H8.5v-.4a1.5 1.5 0 0 0-3 0V13H4a1 1 0 0 1-1-1v-1.5h.4a1.5 1.5 0 0 0 0-3H3V6a1 1 0 0 1 1-1Z"/></svg>'

export const TOOLBAR_FULLSCREEN_ENTER_ICON_SVG =
  '<svg class="d2-toolbar__icon-svg" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" focusable="false" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>'
export const TOOLBAR_FULLSCREEN_EXIT_ICON_SVG =
  '<svg class="d2-toolbar__icon-svg" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" focusable="false" aria-hidden="true"><path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>'
export const TOOLBAR_CACHE_CLEAR_ICON_SVG =
  '<svg class="d2-toolbar__icon-svg" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true"><path d="M3 4h10M6 4V2.5h4V4M4.5 4l.6 9.5h5.8L11.5 4"/></svg>'

export { TOOLBAR_DROP_TRACKER_ICON_SVG, TOOLBAR_KILL_STATS_ICON_SVG }

export class Toolbar {
  private readonly store: SettingsStore
  private readonly pageProtocol: string
  private readonly confirmReconnectFn: (message: string) => boolean
  private readonly callbacks: ToolbarCallbacks
  private connection: ToolbarConnectionState = {
    phase: 'disconnected',
    rttMs: null,
    diagnosticKind: 'none',
  }
  private allowedViewports: readonly ViewportResolution[]
  private serverInputValue: string
  private serverInputValid = true
  private cacheUsageBytes = 0
  private cacheClearedFlash = false
  private pluginsReady = false
  private pluginsHasWarning = false
  private pluginsMenuOpen = false
  private readonly contributions = new Map<string, ContributionEntry>()
  private unsubscribeStore: (() => void) | null = null
  private unsubscribeLang: (() => void) | null = null

  // Optional real DOM elements when mounted in browser
  private rootEl: HTMLElement | null = null
  private statusDotEl: HTMLElement | null = null
  private statusTextEl: HTMLElement | null = null
  private rttTextEl: HTMLElement | null = null
  private langBtnZhEl: HTMLButtonElement | null = null
  private langBtnEnEl: HTMLButtonElement | null = null
  private viewportLabelEl: HTMLElement | null = null
  private viewportSelectEl: HTMLSelectElement | null = null
  private worldFpsSelectEl: HTMLSelectElement | null = null
  private fullscreenBtnEl: HTMLButtonElement | null = null
  private fullscreenBtnIconEl: HTMLElement | null = null
  private fullscreenBtnLabelEl: HTMLElement | null = null
  private fullscreen: FullscreenController | null = null
  private pluginsBtnEl: HTMLButtonElement | null = null
  private pluginsBtnIconEl: HTMLElement | null = null
  private pluginsBtnLabelEl: HTMLElement | null = null
  private pluginSlotEl: HTMLElement | null = null
  private cacheClearBtnEl: HTMLButtonElement | null = null
  private cacheClearBtnIconEl: HTMLElement | null = null
  private cacheClearBtnLabelEl: HTMLElement | null = null
  private diagBannerEl: HTMLElement | null = null

  constructor(options?: ToolbarOptions) {
    this.store = options?.store ?? getGlobalSettingsStore()
    this.pageProtocol =
      options?.pageProtocol ??
      (typeof window !== 'undefined' && window.location ? window.location.protocol : 'https:')
    this.allowedViewports =
      options?.allowedViewports && options.allowedViewports.length > 0
        ? [...options.allowedViewports]
        : [...NATIVE_113C_VIEWPORT_RESOLUTIONS]
    this.confirmReconnectFn =
      options?.confirmReconnect ??
      ((msg: string) =>
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(msg)
          : true)
    this.callbacks = options?.callbacks ?? {}
    this.serverInputValue = this.store.get().serverHost

    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this.mountDom(options?.container ?? null)
    }

    this.unsubscribeStore = this.store.subscribe((next, prev, changedKeys) => {
      if (changedKeys.includes('serverHost')) {
        this.serverInputValue = next.serverHost
        this.serverInputValid = true
      }
      if (changedKeys.includes('lang') && next.lang !== prev.lang) {
        this.callbacks.onLangChange?.(next.lang)
      }
      if (changedKeys.includes('lightingPreset') && next.lightingPreset !== prev.lightingPreset) {
        this.callbacks.onLightingChange?.(next.lightingPreset)
      }
      if (changedKeys.includes('automapReveal') && next.automapReveal !== prev.automapReveal) {
        this.callbacks.onAutomapRevealChange?.(next.automapReveal)
      }
      if (changedKeys.includes('viewport') && next.viewport !== prev.viewport) {
        this.callbacks.onViewportChange?.(getViewportProfile(next.viewport))
      }
      this.syncDom()
    })

    this.unsubscribeLang = onLangChange(() => {
      this.syncDom()
    })
  }

  getElement(): HTMLElement | null {
    return this.rootEl
  }

  getSettings(): ClientSettings {
    return this.store.get()
  }

  getConnectionState(): ToolbarConnectionState {
    return this.connection
  }

  isActiveSession(): boolean {
    const p = this.connection.phase
    return p === 'connecting' || p === 'bncs' || p === 'mcp' || p === 'd2gs'
  }

  setConnectionState(
    next: Partial<ToolbarConnectionState> & { readonly phase: ToolbarConnectionPhase },
  ): void {
    this.connection = {
      phase: next.phase,
      rttMs: next.rttMs !== undefined ? next.rttMs : this.connection.rttMs,
      diagnosticKind:
        next.diagnosticKind ??
        (next.phase === 'error' ? this.connection.diagnosticKind ?? 'custom' : 'none'),
      diagnosticMessage: next.diagnosticMessage,
    }
    this.syncDom()
  }

  setRttMs(rttMs: number | null): void {
    this.connection = {
      ...this.connection,
      rttMs: rttMs !== null && Number.isFinite(rttMs) ? Math.max(0, Math.round(rttMs)) : null,
    }
    this.syncDom()
  }

  reportDiagnostic(kind: ToolbarDiagnosticKind, customMessage?: string): void {
    this.connection = {
      ...this.connection,
      phase: kind === 'none' ? this.connection.phase : 'error',
      diagnosticKind: kind,
      diagnosticMessage: customMessage,
    }
    this.syncDom()
  }

  clearDiagnostic(): void {
    this.connection = {
      ...this.connection,
      diagnosticKind: 'none',
      diagnosticMessage: undefined,
    }
    this.syncDom()
  }

  setDiagBanner(text: string | null): void {
    if (text && text.trim().length > 0) {
      this.reportDiagnostic('custom', text)
    } else {
      this.clearDiagnostic()
    }
  }

  /**
   * Attempt to apply a new `serverHost`.
   * - Validates against `validateServerHost` (rejects bare IP on `https:`).
   * - If currently in an active session (`connecting | bncs | mcp | d2gs`), asks for confirmation before disconnecting & reconnecting.
   */
  submitServerHost(rawHost: string): ServerHostValidationResult & { readonly applied: boolean } {
    this.serverInputValue = rawHost
    const check = validateServerHost(rawHost, this.pageProtocol)
    if (!check.valid) {
      this.serverInputValid = false
      const lang = this.store.get().lang
      const msg = lang === 'en' ? check.errorMessage : (check.errorMessageZh ?? check.errorMessage)
      this.connection = {
        ...this.connection,
        diagnosticKind: check.reason === 'bare_ip_on_https' ? 'bare_ip_on_https' : 'invalid_host',
        diagnosticMessage: msg,
      }
      this.syncDom()
      return { ...check, applied: false }
    }

    const prevHost = this.store.get().serverHost
    if (check.normalizedHost === prevHost) {
      this.serverInputValue = check.normalizedHost
      this.serverInputValid = true
      if (
        this.connection.diagnosticKind === 'bare_ip_on_https' ||
        this.connection.diagnosticKind === 'invalid_host'
      ) {
        this.clearDiagnostic()
      } else {
        this.syncDom()
      }
      return { ...check, applied: true }
    }

    if (this.isActiveSession()) {
      const confirmMsg = tToolbar('toolbar.server.confirmReconnect', this.store.get().lang)
      if (!this.confirmReconnectFn(confirmMsg)) {
        this.serverInputValue = prevHost
        this.serverInputValid = true
        this.syncDom()
        return { ...check, applied: false }
      }
    }

    this.serverInputValid = true
    this.serverInputValue = check.normalizedHost
    if (
      this.connection.diagnosticKind === 'bare_ip_on_https' ||
      this.connection.diagnosticKind === 'invalid_host'
    ) {
      this.connection = {
        ...this.connection,
        diagnosticKind: 'none',
        diagnosticMessage: undefined,
      }
    }
    this.store.setServerHost(check.normalizedHost, this.pageProtocol)
    this.callbacks.onServerHostReconnect?.(check.normalizedHost, prevHost)
    this.syncDom()
    return { ...check, applied: true }
  }

  setLanguage(lang: GameLang): void {
    this.store.set({ lang })
    setLang(lang)
    this.syncDom()
  }

  setLang(lang: GameLang): void {
    this.setLanguage(lang)
  }

  toggleLanguage(): GameLang {
    const next: GameLang = this.store.get().lang === 'en' ? 'zh' : 'en'
    this.setLanguage(next)
    return next
  }

  setLightingPreset(preset: ClientLightingPreset): void {
    this.store.set({ lightingPreset: preset })
    this.syncDom()
  }

  setAutomapReveal(mode: AutomapRevealMode): void {
    this.store.set({ automapReveal: mode })
    this.syncDom()
  }

  getAllowedViewports(): readonly ViewportResolution[] {
    return this.allowedViewports
  }

  setAllowedViewports(resolutions: readonly ViewportResolution[]): void {
    const valid = resolutions.filter((r): r is ViewportResolution =>
      (VALID_VIEWPORT_RESOLUTIONS as readonly string[]).includes(r),
    )
    this.allowedViewports =
      valid.length > 0 ? valid : [...NATIVE_113C_VIEWPORT_RESOLUTIONS]
    const current = this.store.get().viewport
    if (!this.allowedViewports.includes(current)) {
      const fallback: ViewportResolution = this.allowedViewports.includes('800x600')
        ? '800x600'
        : this.allowedViewports[0]!
      this.store.set({ viewport: fallback })
    }
    this.syncDom()
  }

  setViewport(viewport: ViewportResolution): ViewportProfile {
    const target: ViewportResolution = this.allowedViewports.includes(viewport)
      ? viewport
      : this.allowedViewports.includes('800x600')
        ? '800x600'
        : this.allowedViewports[0]!
    this.store.set({ viewport: target })
    this.syncDom()
    return getViewportProfile(target)
  }

  /** Advance to the next resolution in `allowedViewports` order, wrapping back to the first. */
  toggleViewport(): ViewportProfile {
    const order = this.allowedViewports
    const currentIdx = order.indexOf(this.store.get().viewport)
    const next = order[(currentIdx + 1) % order.length]!
    return this.setViewport(next)
  }

  setPluginsButtonState(state: {
    readonly ready: boolean
    readonly hasWarning: boolean
    readonly open?: boolean | undefined
  }): void {
    this.pluginsReady = state.ready
    this.pluginsHasWarning = state.hasWarning
    if (state.open !== undefined) {
      this.pluginsMenuOpen = state.open
    }
    this.syncDom()
  }

  private resolveDefaultContributionIcon(domId: string, explicitIconSvg?: string): string | undefined {
    if (explicitIconSvg && explicitIconSvg.trim().length > 0) {
      return explicitIconSvg
    }
    if (domId === 'd2-toolbar-plugin-kill-stats-open') {
      return TOOLBAR_KILL_STATS_ICON_SVG
    }
    if (domId === 'd2-toolbar-plugin-drop-tracker-open') {
      return TOOLBAR_DROP_TRACKER_ICON_SVG
    }
    return undefined
  }

  private renderContributionLabel(labelEl: HTMLElement, label: string): void {
    const match = typeof document !== 'undefined' ? DROP_BADGE_PATTERN.exec(label) : null
    if (match && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      labelEl.textContent = ''
      const segments: ReadonlyArray<{ readonly cls: string; readonly text: string }> = [
        { cls: 'd2-toolbar__drop-prefix', text: match[1]! },
        { cls: 'd2-toolbar__drop-set', text: match[2]! },
        { cls: 'd2-toolbar__drop-sep', text: match[3]! },
        { cls: 'd2-toolbar__drop-unique', text: match[4]! },
        { cls: 'd2-toolbar__drop-sep', text: match[5]! },
        { cls: 'd2-toolbar__drop-rune', text: match[6]! },
      ]
      for (const seg of segments) {
        const span = document.createElement('span')
        span.className = seg.cls
        span.textContent = seg.text
        labelEl.appendChild(span)
      }
      return
    }
    labelEl.textContent = label
  }

  registerContribution(spec: ToolbarContributionSpec): ToolbarContributionHandle {
    return this.addContribution(spec)
  }

  addContribution(spec: ToolbarContributionSpec): ToolbarContributionHandle {
    const existing = this.contributions.get(spec.domId)

    let el: HTMLElement | null = null
    let iconEl: HTMLElement | null = null
    let labelEl: HTMLElement | null = null
    let selectEl: HTMLSelectElement | null = null

    if (typeof document !== 'undefined' && this.pluginSlotEl) {
      const lang = this.store.get().lang || getGameLang()
      const label = resolveLocalizedText(spec.label, lang)
      const tooltip = spec.tooltip ? resolveLocalizedText(spec.tooltip, lang) : label
      if (spec.kind === 'link' || spec.kind === 'button') {
        const node =
          spec.kind === 'link' ? document.createElement('a') : document.createElement('button')
        node.id = spec.domId
        node.className = 'd2-toolbar__btn'
        if (spec.kind === 'link') {
          const link = node as HTMLAnchorElement
          link.href = spec.href
          link.target = '_blank'
          link.rel = 'noopener'
        } else {
          const btn = node as HTMLButtonElement
          btn.type = 'button'
          btn.addEventListener('click', () => {
            spec.onClick()
          })
        }
        node.title = tooltip
        const resolvedIcon = this.resolveDefaultContributionIcon(spec.domId, spec.iconSvg)
        if (resolvedIcon) {
          const iconSpan = document.createElement('span')
          iconSpan.className = 'd2-toolbar__btn-icon'
          iconSpan.setAttribute('aria-hidden', 'true')
          iconSpan.innerHTML = resolvedIcon
          node.appendChild(iconSpan)
          iconEl = iconSpan
        }
        const lblSpan = document.createElement('span')
        lblSpan.className = 'd2-toolbar__btn-label'
        this.renderContributionLabel(lblSpan, label)
        node.appendChild(lblSpan)
        labelEl = lblSpan
        el = node
      } else {
        const group = document.createElement('div')
        group.id = spec.domId
        group.className = 'd2-toolbar__group'

        const lbl = document.createElement('label')
        lbl.className = 'd2-toolbar__label'
        lbl.htmlFor = spec.selectDomId
        lbl.textContent = label

        const sel = document.createElement('select')
        sel.id = spec.selectDomId
        sel.className = 'd2-toolbar__select'
        for (const optSpec of spec.options) {
          const opt = document.createElement('option')
          opt.value = optSpec.value
          opt.textContent = resolveLocalizedText(optSpec.label, lang)
          sel.appendChild(opt)
        }
        sel.value = spec.getValue()
        sel.addEventListener('change', () => {
          spec.onChange(sel.value)
        })

        group.appendChild(lbl)
        group.appendChild(sel)
        el = group
        labelEl = lbl
        selectEl = sel
      }
      if (existing?.el && existing.el.parentNode === this.pluginSlotEl) {
        if (typeof this.pluginSlotEl.replaceChild === 'function') {
          this.pluginSlotEl.replaceChild(el, existing.el)
        } else {
          const children = (this.pluginSlotEl as unknown as { children?: HTMLElement[] }).children
          const idx = Array.isArray(children) ? children.indexOf(existing.el) : -1
          if (idx >= 0 && Array.isArray(children)) {
            ;(existing.el as unknown as { parentNode: HTMLElement | null }).parentNode = null
            ;(el as unknown as { parentNode: HTMLElement | null }).parentNode = this.pluginSlotEl
            children[idx] = el
          } else {
            existing.el.remove()
            this.pluginSlotEl.appendChild(el)
          }
        }
      } else {
        existing?.el?.remove()
        this.pluginSlotEl.appendChild(el)
      }
    } else if (existing) {
      existing.el?.remove()
    }

    const entry: ContributionEntry = { spec, el, iconEl, labelEl, selectEl }
    this.contributions.set(spec.domId, entry)

    const dispose = (): void => {
      const current = this.contributions.get(spec.domId)
      if (current === entry) {
        current.el?.remove()
        this.contributions.delete(spec.domId)
      }
    }

    const update = (patch: ToolbarContributionPatch): void => {
      const current = this.contributions.get(spec.domId)
      if (!current) return
      current.spec = {
        ...current.spec,
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.tooltip !== undefined ? { tooltip: patch.tooltip } : {}),
        ...(patch.iconSvg !== undefined && current.spec.kind !== 'select'
          ? { iconSvg: patch.iconSvg }
          : {}),
      }
      this.syncDom()
    }

    return Object.assign(dispose, {
      dispose,
      update,
    })
  }

  setAssetCacheUsageBytes(bytes: number): void {
    this.cacheUsageBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
    this.syncDom()
  }

  async clearAssetCache(): Promise<number> {
    const res = await clearClientAssetCache()
    this.cacheUsageBytes = 0
    this.cacheClearedFlash = true
    this.syncDom()
    await this.callbacks.onClearCache?.()
    setTimeout(() => {
      this.cacheClearedFlash = false
      this.syncDom()
    }, 1500)
    return res.deletedEntries
  }

  getSnapshot(): ToolbarSnapshot {
    const settings = this.store.get()
    const lang = settings.lang || getGameLang()
    const statusKey = `toolbar.status.${this.connection.phase}` as const
    const statusLabel = tToolbar(statusKey, lang)
    const rttLabel =
      this.connection.rttMs !== null ? `${this.connection.rttMs} ms` : '-- ms'

    let diagnosticBannerText: string | null = null
    const kind = this.connection.diagnosticKind ?? 'none'
    if (kind === 'quota_exceeded') {
      diagnosticBannerText = tToolbar('toolbar.diag.quotaExceeded', lang)
    } else if (kind === 'tls_error') {
      diagnosticBannerText = tToolbar('toolbar.diag.tlsError', lang)
    } else if (kind === 'bare_ip_on_https') {
      diagnosticBannerText =
        this.connection.diagnosticMessage ?? tToolbar('toolbar.diag.bareIpHttps', lang)
    } else if (kind === 'invalid_host' || kind === 'custom') {
      diagnosticBannerText = this.connection.diagnosticMessage ?? null
    }

    return {
      connection: this.connection,
      settings,
      viewportProfile: getViewportProfile(settings.viewport),
      allowedViewports: this.allowedViewports,
      statusLabel,
      rttLabel,
      diagnosticBannerText,
      serverInputValue: this.serverInputValue,
      serverInputValid: this.serverInputValid,
    }
  }

  destroy(): void {
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    this.unsubscribeLang?.()
    this.unsubscribeLang = null
    this.contributions.clear()
    this.fullscreen?.dispose()
    this.fullscreen = null
    if (this.rootEl && this.rootEl.parentNode) {
      this.rootEl.parentNode.removeChild(this.rootEl)
    }
    this.rootEl = null
  }

  private ensureStyles(doc: Document): void {
    if (!doc.head || doc.getElementById('d2-toolbar-styles')) return
    const styleEl = doc.createElement('style')
    styleEl.id = 'd2-toolbar-styles'
    styleEl.textContent = `
#d2-toolbar,
.d2-toolbar {
  position: relative;
  z-index: 1000;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  padding: 0 12px;
  box-sizing: border-box;
  background: linear-gradient(180deg, #211b14 0%, #120f0a 55%, #0a0806 100%);
  border-bottom: 1px solid #634e2b;
  box-shadow: inset 0 1px 0 rgba(255, 226, 158, 0.14), 0 2px 8px rgba(0, 0, 0, 0.85);
  color: #e2cfa0;
  font-family: var(--font-body, "D2Formal436", "Noto Serif SC", "Songti SC", "PingFang SC", Georgia, serif);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  user-select: none;
}
.d2-toolbar__group {
  display: inline-flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  white-space: nowrap;
}
.d2-toolbar > .d2-toolbar__group + .d2-toolbar__group {
  padding-left: 10px;
  border-left: 1px solid rgba(199, 179, 119, 0.2);
}
.d2-toolbar__group--segmented {
  gap: 0;
}
.d2-toolbar__group--segmented .d2-toolbar__btn:first-child {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  padding: 0 8px;
}
.d2-toolbar__group--segmented .d2-toolbar__btn:last-child {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: -1px;
  padding: 0 8px;
  font-family: "JetBrains Mono", "Consolas", var(--font-body, serif);
  font-size: 11px;
}
.d2-toolbar__group--segmented .d2-toolbar__btn--active {
  position: relative;
  z-index: 1;
}
.d2-toolbar__divider {
  width: 1px;
  height: 18px;
  background: linear-gradient(180deg, rgba(199, 179, 119, 0.08) 0%, rgba(199, 179, 119, 0.48) 50%, rgba(199, 179, 119, 0.08) 100%);
  flex-shrink: 0;
}
.d2-toolbar__status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 22px;
  padding: 0 9px;
  box-sizing: border-box;
  border-radius: 3px;
  background: linear-gradient(180deg, #0e0b08 0%, #17130d 100%);
  border: 1px solid #463720;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.85), 0 1px 0 rgba(255, 226, 158, 0.06);
  color: #e4d4a8;
  font-size: 11.5px;
}
.d2-toolbar__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  background: #6b6b6b;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
}
.d2-toolbar__status-dot--disconnected { background: #767676; }
.d2-toolbar__status-dot--connecting { background: #e6a822; box-shadow: 0 0 6px #e6a822; }
.d2-toolbar__status-dot--bncs { background: #4495e8; box-shadow: 0 0 6px #4495e8; }
.d2-toolbar__status-dot--mcp { background: #36c5d6; box-shadow: 0 0 6px #36c5d6; }
.d2-toolbar__status-dot--d2gs { background: #2ecc71; box-shadow: 0 0 6px #2ecc71; }
.d2-toolbar__status-dot--error { background: #e74c3c; box-shadow: 0 0 6px #e74c3c; }
.d2-toolbar__rtt {
  padding-left: 6px;
  border-left: 1px solid #352a19;
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: #a89974;
}
.d2-toolbar__label {
  color: #b89f65;
  font-family: var(--font-body, "D2Formal436", "Noto Serif SC", "Songti SC", Georgia, serif);
  font-size: 11.5px;
  letter-spacing: 0.03em;
}
.d2-toolbar__select {
  appearance: none;
  -webkit-appearance: none;
  height: 22px;
  padding: 0 22px 0 8px;
  box-sizing: border-box;
  background-color: #14100b;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23c7b377' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"),
    linear-gradient(180deg, #261f14 0%, #130f0a 100%);
  background-repeat: no-repeat, no-repeat;
  background-position: right 6px center, 0 0;
  border: 1px solid #5a482a;
  border-radius: 3px;
  box-shadow: inset 0 1px 0 rgba(255, 230, 165, 0.1), 0 1px 2px rgba(0, 0, 0, 0.55);
  color: #ebd9a8;
  font-family: "JetBrains Mono", "Consolas", var(--font-body, serif);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  outline: none;
}
.d2-toolbar__select option {
  background: #14100b;
  color: #ebd9a8;
}
.d2-toolbar__select:hover,
.d2-toolbar__btn:hover:not(:disabled) {
  border-color: #d4bc7c;
  color: #fff4ce;
  box-shadow: inset 0 1px 0 rgba(255, 240, 190, 0.22), 0 0 6px rgba(212, 180, 106, 0.2);
}
.d2-toolbar__btn,
a.d2-toolbar__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px;
  box-sizing: border-box;
  background: linear-gradient(180deg, #2e2518 0%, #17120b 100%);
  border: 1px solid #5e4b2b;
  border-radius: 3px;
  box-shadow: inset 0 1px 0 rgba(255, 230, 165, 0.14), 0 1px 2px rgba(0, 0, 0, 0.55);
  color: #e6d29e;
  font-family: var(--font-body, "D2Formal436", "Noto Serif SC", "Songti SC", "PingFang SC", Georgia, serif);
  font-size: 11.5px;
  text-decoration: none;
  cursor: pointer;
}
.d2-toolbar__btn:active:not(:disabled),
a.d2-toolbar__btn:active {
  transform: translateY(1px);
}
.d2-toolbar__btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  line-height: 0;
  color: #d4b872;
}
.d2-toolbar__btn-icon svg {
  width: 12px;
  height: 12px;
  display: block;
}
.d2-toolbar__btn-label {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
.d2-toolbar__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.d2-toolbar__btn--active {
  background: linear-gradient(180deg, #5e4923 0%, #332711 100%);
  border-color: #dfbe73;
  box-shadow: inset 0 1px 0 rgba(255, 244, 204, 0.32), 0 0 6px rgba(212, 180, 106, 0.25);
  color: #fff6db;
}
.d2-toolbar__btn--warn {
  border-color: #d4882a;
  color: #ffb84d;
}
.d2-toolbar__drop-prefix {
  margin-right: 4px;
}
.d2-toolbar__drop-set {
  color: #3ad649;
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.d2-toolbar__drop-unique {
  color: #e2be68;
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.d2-toolbar__drop-rune {
  color: #ff9c38;
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.d2-toolbar__drop-sep {
  color: #7d6d4c;
  margin: 0 2px;
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 10px;
}
.d2-toolbar__diag {
  position: absolute;
  top: 32px;
  left: 12px;
  right: 12px;
  z-index: 1001;
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(38, 12, 10, 0.96);
  border: 1px solid #a93226;
  border-top: none;
  border-radius: 0 0 4px 4px;
  color: #ffd6d1;
  font-size: 12px;
}
.d2-toolbar__diag--visible {
  display: flex;
}
`
    doc.head.appendChild(styleEl)
  }

  private createFullscreenController(doc: Document): FullscreenController | null {
    const fsDoc = doc as Partial<FullscreenDocLike> & { documentElement?: HTMLElement | null }
    if (
      !fsDoc.documentElement ||
      typeof fsDoc.addEventListener !== 'function' ||
      typeof fsDoc.removeEventListener !== 'function' ||
      typeof fsDoc.exitFullscreen !== 'function'
    ) {
      return null
    }
    return new FullscreenController({
      doc: doc as unknown as FullscreenDocLike,
      target: fsDoc.documentElement,
      onChange: () => {
        this.syncDom()
      },
      onError: (kind, detail) => {
        const message = `${tToolbar('toolbar.fullscreen.failed', this.store.get().lang)} (${kind}): ${detail}`
        if (this.callbacks.onFullscreenError) {
          this.callbacks.onFullscreenError(message)
        } else {
          console.error('[toolbar]', message)
        }
        this.syncDom()
      },
    })
  }

  private mountDom(container: HTMLElement | null): void {
    const doc = document
    this.ensureStyles(doc)
    const root = doc.createElement('header')
    root.id = 'd2-toolbar'
    root.className = 'd2-toolbar'

    // Group 1: Connection Status + RTT
    const statusGroup = doc.createElement('div')
    statusGroup.className = 'd2-toolbar__group'

    const statusBadge = doc.createElement('div')
    statusBadge.id = 'd2-toolbar-status'
    statusBadge.className = 'd2-toolbar__status'
    const dot = doc.createElement('span')
    dot.id = 'd2-toolbar-status-dot'
    dot.className = 'd2-toolbar__status-dot d2-toolbar__status-dot--disconnected'
    const statusText = doc.createElement('span')
    statusText.id = 'd2-toolbar-status-text'
    const rttText = doc.createElement('span')
    rttText.id = 'd2-toolbar-rtt'
    rttText.className = 'd2-toolbar__rtt'
    statusBadge.appendChild(dot)
    statusBadge.appendChild(statusText)
    statusBadge.appendChild(rttText)
    statusGroup.appendChild(statusBadge)

    // Group 2: Viewport Size Selector + Asset Cache Clear button
    const viewportGroup = doc.createElement('div')
    viewportGroup.className = 'd2-toolbar__group'
    const viewportLabel = doc.createElement('label')
    viewportLabel.className = 'd2-toolbar__label'
    viewportLabel.htmlFor = 'd2-toolbar-viewport-select'
    const viewportSelect = doc.createElement('select')
    viewportSelect.id = 'd2-toolbar-viewport-select'
    viewportSelect.className = 'd2-toolbar__select'
    viewportSelect.addEventListener('change', () => {
      this.setViewport(viewportSelect.value as ViewportResolution)
    })

    // World render-rate selector right after the viewport selector: 60 (default,
    // uncapped) or 30 (≈half the GPU raster; 1.13c-native feel is stiffer still).
    const fpsSelect = doc.createElement('select')
    fpsSelect.id = 'd2-toolbar-worldfps-select'
    fpsSelect.className = 'd2-toolbar__select'
    for (const fps of [60, 30] as const) {
      const opt = doc.createElement('option')
      opt.value = String(fps)
      opt.textContent = `${fps} FPS`
      fpsSelect.appendChild(opt)
    }
    fpsSelect.addEventListener('change', () => {
      this.store.set({ worldRenderFps: fpsSelect.value === '30' ? 30 : 60 })
    })

    // NOT 1.13c: fullscreen toggle right after the FPS selector (whole document goes fullscreen,
    // so this toolbar stays visible to restore; Esc / F11 restore via the browser default).
    const fullscreenBtn = doc.createElement('button')
    fullscreenBtn.type = 'button'
    fullscreenBtn.id = 'd2-toolbar-fullscreen-btn'
    fullscreenBtn.className = 'd2-toolbar__btn'
    const fullscreenBtnIcon = doc.createElement('span')
    fullscreenBtnIcon.className = 'd2-toolbar__btn-icon'
    fullscreenBtnIcon.setAttribute('aria-hidden', 'true')
    const fullscreenBtnLabel = doc.createElement('span')
    fullscreenBtnLabel.className = 'd2-toolbar__btn-label'
    fullscreenBtn.appendChild(fullscreenBtnIcon)
    fullscreenBtn.appendChild(fullscreenBtnLabel)
    this.fullscreen = this.createFullscreenController(doc)
    fullscreenBtn.addEventListener('click', () => {
      this.fullscreen?.toggle()
    })

    const cacheClearBtn = doc.createElement('button')
    cacheClearBtn.type = 'button'
    cacheClearBtn.id = 'd2-toolbar-cache-clear-btn'
    cacheClearBtn.className = 'd2-toolbar__btn'
    const cacheClearBtnIcon = doc.createElement('span')
    cacheClearBtnIcon.className = 'd2-toolbar__btn-icon'
    cacheClearBtnIcon.setAttribute('aria-hidden', 'true')
    cacheClearBtnIcon.innerHTML = TOOLBAR_CACHE_CLEAR_ICON_SVG
    const cacheClearBtnLabel = doc.createElement('span')
    cacheClearBtnLabel.className = 'd2-toolbar__btn-label'
    cacheClearBtn.appendChild(cacheClearBtnIcon)
    cacheClearBtn.appendChild(cacheClearBtnLabel)
    cacheClearBtn.addEventListener('click', () => {
      void this.clearAssetCache()
    })

    viewportGroup.appendChild(viewportLabel)
    viewportGroup.appendChild(viewportSelect)
    viewportGroup.appendChild(fpsSelect)
    viewportGroup.appendChild(fullscreenBtn)
    viewportGroup.appendChild(cacheClearBtn)

    // Group 3: Language Toggle (中 / EN)
    const langGroup = doc.createElement('div')
    langGroup.className = 'd2-toolbar__group d2-toolbar__group--segmented'
    const langBtnZh = doc.createElement('button')
    langBtnZh.type = 'button'
    langBtnZh.id = 'd2-toolbar-lang-zh'
    langBtnZh.className = 'd2-toolbar__btn'
    langBtnZh.textContent = '中'
    langBtnZh.addEventListener('click', () => this.setLanguage('zh'))

    const langBtnEn = doc.createElement('button')
    langBtnEn.type = 'button'
    langBtnEn.id = 'd2-toolbar-lang-en'
    langBtnEn.className = 'd2-toolbar__btn'
    langBtnEn.textContent = 'EN'
    langBtnEn.addEventListener('click', () => this.setLanguage('en'))

    langGroup.appendChild(langBtnZh)
    langGroup.appendChild(langBtnEn)

    // Group 4: Vertical Divider
    const divider = doc.createElement('div')
    divider.className = 'd2-toolbar__divider'
    divider.setAttribute('role', 'separator')

    // Group 5: Plugins management button ([🧩 插件])
    const pluginsBtn = doc.createElement('button')
    pluginsBtn.type = 'button'
    pluginsBtn.id = 'd2-toolbar-plugins-btn'
    pluginsBtn.className = 'd2-toolbar__btn'
    pluginsBtn.disabled = !this.pluginsReady
    const pluginsBtnIcon = doc.createElement('span')
    pluginsBtnIcon.className = 'd2-toolbar__btn-icon'
    pluginsBtnIcon.setAttribute('aria-hidden', 'true')
    pluginsBtnIcon.innerHTML = TOOLBAR_PLUGINS_ICON_SVG
    const pluginsBtnLabel = doc.createElement('span')
    pluginsBtnLabel.className = 'd2-toolbar__btn-label'
    pluginsBtn.appendChild(pluginsBtnIcon)
    pluginsBtn.appendChild(pluginsBtnLabel)
    pluginsBtn.addEventListener('click', () => {
      if (!this.pluginsReady) return
      this.callbacks.onPluginsToggle?.()
    })

    // Group 6: Plugin Contribution Slot
    const pluginSlot = doc.createElement('div')
    pluginSlot.id = 'd2-toolbar-plugin-slot'
    pluginSlot.className = 'd2-toolbar__group'

    // Group 7: Diagnostic Banner
    const diagBanner = doc.createElement('div')
    diagBanner.id = 'd2-toolbar-diag-banner'
    diagBanner.className = 'd2-toolbar__diag'
    diagBanner.hidden = true

    root.appendChild(statusGroup)
    root.appendChild(viewportGroup)
    root.appendChild(langGroup)
    root.appendChild(divider)
    root.appendChild(pluginsBtn)
    root.appendChild(pluginSlot)
    root.appendChild(diagBanner)

    const g = globalThis as Record<string, unknown>
    if (typeof g.Node === 'undefined') {
      class NodeShim {
        static readonly DOCUMENT_POSITION_DISCONNECTED = 1
        static readonly DOCUMENT_POSITION_PRECEDING = 2
        static readonly DOCUMENT_POSITION_FOLLOWING = 4
        static readonly DOCUMENT_POSITION_CONTAINS = 8
        static readonly DOCUMENT_POSITION_CONTAINED_BY = 16
        static readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = 32
      }
      g.Node = NodeShim
    }
    if (
      typeof (root as unknown as { compareDocumentPosition?: unknown }).compareDocumentPosition !==
      'function'
    ) {
      type TreeNode = {
        parentNode?: TreeNode | null
        childNodes?: TreeNode[]
        children?: TreeNode[]
      }
      const compareDocPos = function (this: TreeNode, other: unknown): number {
        if (!other || this === other) return 0
        let top: TreeNode = this
        while (top.parentNode) {
          top = top.parentNode
        }
        const order: TreeNode[] = []
        const walk = (n: TreeNode): void => {
          order.push(n)
          const kids = n.childNodes ?? n.children ?? []
          if (Array.isArray(kids)) {
            for (const c of kids) {
              walk(c)
            }
          }
        }
        walk(top)
        const selfIdx = order.indexOf(this)
        const otherIdx = order.indexOf(other as TreeNode)
        if (selfIdx < 0 || otherIdx < 0) return 1
        return otherIdx > selfIdx ? 4 : 2
      }
      const proto = Object.getPrototypeOf(root) as Record<string, unknown> | null
      if (proto && proto !== Object.prototype) {
        proto.compareDocumentPosition = compareDocPos
      }
      const attachCompare = (node: unknown): void => {
        if (!node || typeof node !== 'object') return
        const rec = node as Record<string, unknown>
        if (typeof rec.compareDocumentPosition !== 'function') {
          rec.compareDocumentPosition = compareDocPos
        }
        const kids = (rec.childNodes ?? rec.children) as unknown[] | undefined
        if (Array.isArray(kids)) {
          for (const k of kids) attachCompare(k)
        }
      }
      attachCompare(root)
    }

    if (container) {
      container.innerHTML = ''
      container.appendChild(root)
    }

    this.rootEl = root
    this.statusDotEl = dot
    this.statusTextEl = statusText
    this.rttTextEl = rttText
    this.langBtnZhEl = langBtnZh
    this.langBtnEnEl = langBtnEn
    this.viewportLabelEl = viewportLabel
    this.viewportSelectEl = viewportSelect
    this.worldFpsSelectEl = fpsSelect
    this.fullscreenBtnEl = fullscreenBtn
    this.fullscreenBtnIconEl = fullscreenBtnIcon
    this.fullscreenBtnLabelEl = fullscreenBtnLabel
    this.pluginsBtnEl = pluginsBtn
    this.pluginsBtnIconEl = pluginsBtnIcon
    this.pluginsBtnLabelEl = pluginsBtnLabel
    this.pluginSlotEl = pluginSlot
    this.cacheClearBtnEl = cacheClearBtn
    this.cacheClearBtnIconEl = cacheClearBtnIcon
    this.cacheClearBtnLabelEl = cacheClearBtnLabel
    this.diagBannerEl = diagBanner

    this.syncDom()
  }

  private syncDom(): void {
    if (!this.rootEl) return
    const snap = this.getSnapshot()
    const lang = snap.settings.lang

    if (this.statusDotEl) {
      this.statusDotEl.className = `d2-toolbar__status-dot d2-toolbar__status-dot--${snap.connection.phase}`
    }
    if (this.statusTextEl) {
      this.statusTextEl.textContent = snap.statusLabel
    }
    if (this.rttTextEl) {
      this.rttTextEl.textContent = snap.rttLabel
    }
    if (this.pluginsBtnEl) {
      const baseLabel = tToolbar('toolbar.plugins.open', lang)
      const fullLabel = this.pluginsHasWarning ? `${baseLabel} ⚠` : baseLabel
      this.pluginsBtnEl.disabled = !this.pluginsReady
      if (this.pluginsBtnLabelEl) {
        this.pluginsBtnLabelEl.textContent = fullLabel
      } else {
        this.pluginsBtnEl.textContent = fullLabel
      }
      this.pluginsBtnEl.title = baseLabel
      this.pluginsBtnEl.setAttribute('aria-expanded', this.pluginsMenuOpen ? 'true' : 'false')
      this.pluginsBtnEl.setAttribute('aria-haspopup', 'dialog')
      let cls = 'd2-toolbar__btn'
      if (this.pluginsMenuOpen) cls += ' d2-toolbar__btn--active'
      if (this.pluginsHasWarning) cls += ' d2-toolbar__btn--warn'
      this.pluginsBtnEl.className = cls
    }
    for (const entry of this.contributions.values()) {
      if (!entry.el) continue
      const spec = entry.spec
      const label = resolveLocalizedText(spec.label, lang)
      if (spec.kind === 'select') {
        if (entry.labelEl) {
          entry.labelEl.textContent = label
        }
        if (entry.selectEl && typeof document !== 'undefined') {
          const currentOpts = Array.from(entry.selectEl.options)
          if (
            currentOpts.length !== spec.options.length ||
            currentOpts.some((o, idx) => o.value !== spec.options[idx]?.value)
          ) {
            entry.selectEl.innerHTML = ''
            for (const optSpec of spec.options) {
              const opt = document.createElement('option')
              opt.value = optSpec.value
              opt.textContent = resolveLocalizedText(optSpec.label, lang)
              entry.selectEl.appendChild(opt)
            }
          } else {
            for (let idx = 0; idx < spec.options.length; idx += 1) {
              const optSpec = spec.options[idx]!
              const optEl = currentOpts[idx]
              if (optEl) {
                optEl.textContent = resolveLocalizedText(optSpec.label, lang)
              }
            }
          }
          entry.selectEl.value = spec.getValue()
        }
      } else {
        const tooltip = spec.tooltip ? resolveLocalizedText(spec.tooltip, lang) : label
        const resolvedIcon = this.resolveDefaultContributionIcon(spec.domId, spec.iconSvg)
        if (entry.iconEl && resolvedIcon) {
          entry.iconEl.innerHTML = resolvedIcon
        }
        if (entry.labelEl) {
          if (entry.labelEl.parentNode !== entry.el) {
            entry.el.textContent = ''
            if (entry.iconEl && resolvedIcon) {
              entry.el.appendChild(entry.iconEl)
            }
            entry.el.appendChild(entry.labelEl)
          }
          this.renderContributionLabel(entry.labelEl, label)
        } else {
          entry.el.textContent = label
        }
        entry.el.title = tooltip
      }
    }
    if (this.langBtnZhEl) {
      this.langBtnZhEl.className =
        lang === 'zh' ? 'd2-toolbar__btn d2-toolbar__btn--active' : 'd2-toolbar__btn'
      this.langBtnZhEl.setAttribute('aria-pressed', lang === 'zh' ? 'true' : 'false')
    }
    if (this.langBtnEnEl) {
      this.langBtnEnEl.className =
        lang === 'en' ? 'd2-toolbar__btn d2-toolbar__btn--active' : 'd2-toolbar__btn'
      this.langBtnEnEl.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false')
    }
    if (this.viewportLabelEl) {
      this.viewportLabelEl.textContent = tToolbar('toolbar.viewport.label', lang)
    }
    if (this.viewportSelectEl && typeof document !== 'undefined') {
      const existingValues = Array.from(this.viewportSelectEl.options).map((o) => o.value)
      const needsRebuild =
        existingValues.length !== this.allowedViewports.length ||
        existingValues.some((v, idx) => v !== this.allowedViewports[idx])
      if (needsRebuild) {
        this.viewportSelectEl.innerHTML = ''
        for (const vp of this.allowedViewports) {
          const opt = document.createElement('option')
          opt.value = vp
          opt.textContent = formatViewportLabel(vp)
          this.viewportSelectEl.appendChild(opt)
        }
      }
      this.viewportSelectEl.value = snap.settings.viewport
    }
    if (this.worldFpsSelectEl) {
      this.worldFpsSelectEl.value = String(snap.settings.worldRenderFps)
    }
    if (this.fullscreenBtnEl) {
      const active = this.fullscreen?.isActive() ?? false
      const label = tToolbar(active ? 'toolbar.fullscreen.exit' : 'toolbar.fullscreen.enter', lang)
      if (this.fullscreenBtnIconEl) {
        this.fullscreenBtnIconEl.innerHTML = active
          ? TOOLBAR_FULLSCREEN_EXIT_ICON_SVG
          : TOOLBAR_FULLSCREEN_ENTER_ICON_SVG
      }
      if (this.fullscreenBtnLabelEl) {
        this.fullscreenBtnLabelEl.textContent = label
      } else {
        this.fullscreenBtnEl.textContent = label
      }
      this.fullscreenBtnEl.title = label
      this.fullscreenBtnEl.disabled = !(this.fullscreen?.isSupported() ?? false)
      this.fullscreenBtnEl.setAttribute('aria-pressed', active ? 'true' : 'false')
      this.fullscreenBtnEl.className = active
        ? 'd2-toolbar__btn d2-toolbar__btn--active'
        : 'd2-toolbar__btn'
    }
    if (this.cacheClearBtnEl) {
      let labelText: string
      if (this.cacheClearedFlash) {
        labelText = tToolbar('toolbar.cache.cleared', lang)
      } else {
        const baseLabel = tToolbar('toolbar.cache.clear', lang)
        labelText =
          this.cacheUsageBytes > 0
            ? `${baseLabel} (${formatCacheBytesMb(this.cacheUsageBytes)})`
            : baseLabel
      }
      if (this.cacheClearBtnIconEl) {
        this.cacheClearBtnIconEl.innerHTML = TOOLBAR_CACHE_CLEAR_ICON_SVG
      }
      if (this.cacheClearBtnLabelEl) {
        this.cacheClearBtnLabelEl.textContent = labelText
      } else {
        this.cacheClearBtnEl.textContent = labelText
      }
      this.cacheClearBtnEl.title = labelText
    }
    if (this.diagBannerEl) {
      if (snap.diagnosticBannerText) {
        this.diagBannerEl.hidden = false
        this.diagBannerEl.textContent = snap.diagnosticBannerText
        this.diagBannerEl.className = 'd2-toolbar__diag d2-toolbar__diag--visible'
      } else {
        this.diagBannerEl.hidden = true
        this.diagBannerEl.textContent = ''
        this.diagBannerEl.className = 'd2-toolbar__diag'
      }
    }
  }
}
