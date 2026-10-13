import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SettingsStore } from '../../src/client/settings/settings-store.ts'
import {
  TOOLBAR_CACHE_CLEAR_ICON_SVG,
  TOOLBAR_DROP_TRACKER_ICON_SVG,
  TOOLBAR_FULLSCREEN_ENTER_ICON_SVG,
  TOOLBAR_FULLSCREEN_EXIT_ICON_SVG,
  TOOLBAR_KILL_STATS_ICON_SVG,
  TOOLBAR_PLUGINS_ICON_SVG,
  Toolbar,
} from '../../src/client/toolbar/toolbar.ts'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private readonly map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}

class FakeElement {
  readonly tagName: string
  readonly children: FakeElement[] = []
  readonly style: Record<string, string> = {}
  parentNode: FakeElement | null = null
  id = ''
  className = ''
  type = ''
  value = ''
  title = ''
  htmlFor = ''
  disabled = false
  hidden = false
  rawHtml = ''
  private text = ''
  private readonly attrs = new Map<string, string>()
  private readonly listeners = new Map<string, Array<(ev: { type: string }) => void>>()

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
  }

  get options(): FakeElement[] {
    return this.children
  }

  get innerHTML(): string {
    return this.rawHtml
  }

  set innerHTML(val: string) {
    this.rawHtml = val
    if (val === '') {
      for (const c of this.children) c.parentNode = null
      this.children.length = 0
      this.text = ''
    }
  }

  get textContent(): string {
    if (this.children.length === 0) return this.text
    return this.text + this.children.map((c) => c.textContent).join('')
  }

  set textContent(val: string | null) {
    for (const c of this.children) c.parentNode = null
    this.children.length = 0
    this.text = val ?? ''
  }

  setAttribute(name: string, val: string): void {
    if (name === 'id') this.id = val
    if (name === 'class') this.className = val
    this.attrs.set(name, val)
  }

  getAttribute(name: string): string | null {
    if (name === 'id' && this.id) return this.id
    if (name === 'class' && this.className) return this.className
    return this.attrs.get(name) ?? null
  }

  appendChild(child: FakeElement): FakeElement {
    if (child.parentNode) {
      child.parentNode.removeChild(child)
    }
    child.parentNode = this
    this.children.push(child)
    return child
  }

  replaceChild(newChild: FakeElement, oldChild: FakeElement): FakeElement {
    const idx = this.children.indexOf(oldChild)
    if (idx >= 0) {
      if (newChild.parentNode) newChild.parentNode.removeChild(newChild)
      oldChild.parentNode = null
      newChild.parentNode = this
      this.children[idx] = newChild
    }
    return oldChild
  }

  removeChild(child: FakeElement): FakeElement {
    const idx = this.children.indexOf(child)
    if (idx >= 0) {
      this.children.splice(idx, 1)
      child.parentNode = null
    }
    return child
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this)
    }
  }

  addEventListener(type: string, cb: (ev: { type: string }) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(cb)
    this.listeners.set(type, list)
  }

  dispatchEvent(ev: { type: string }): void {
    for (const cb of [...(this.listeners.get(ev.type) ?? [])]) {
      cb(ev)
    }
  }

  click(): void {
    this.dispatchEvent({ type: 'click' })
  }

  private matchesSelector(selector: string): boolean {
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1)
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1)
      return this.className.split(/\s+/).includes(cls)
    }
    return this.tagName.toLowerCase() === selector.toLowerCase()
  }

  querySelector<T = FakeElement>(selector: string): T | null {
    for (const child of this.children) {
      if (child.matchesSelector(selector)) return child as unknown as T
      const found = child.querySelector<T>(selector)
      if (found) return found
    }
    return null
  }
}

describe('Top Toolbar Layout & Plugin Slot Architecture (#795)', () => {
  it('renders left-to-right intrinsic groups followed by .d2-toolbar__divider, #d2-toolbar-plugins-btn, #d2-toolbar-plugin-slot, and #d2-toolbar-diag-banner', () => {
    const prevDoc = (globalThis as { document?: unknown }).document
    const head = new FakeElement('head')
    const body = new FakeElement('body')
    const container = new FakeElement('div')
    body.appendChild(container)
    ;(globalThis as { document?: unknown }).document = {
      head,
      body,
      createElement(tag: string) {
        return new FakeElement(tag)
      },
      getElementById(id: string) {
        return body.querySelector(`#${id}`) ?? head.querySelector(`#${id}`)
      },
    }

    try {
      const store = new SettingsStore({
        storage: new MemoryStorage(),
        defaultLang: 'zh',
        syncGlobalLang: false,
      })
      const toolbar = new Toolbar({
        container: container as unknown as HTMLElement,
        store,
      })
      const root = container.querySelector('#d2-toolbar')!
      expect(root).not.toBeNull()

      const children = Array.from(root.children)
      const divider = root.querySelector('.d2-toolbar__divider')!
      const pluginsBtn = root.querySelector('#d2-toolbar-plugins-btn')!
      const pluginSlot = root.querySelector('#d2-toolbar-plugin-slot')!
      const diagBanner = root.querySelector('#d2-toolbar-diag-banner')!

      expect(divider).not.toBeNull()
      expect(pluginsBtn).not.toBeNull()
      expect(pluginSlot).not.toBeNull()
      expect(diagBanner).not.toBeNull()
      expect(diagBanner.hidden).toBe(true)

      const pluginsIcon = pluginsBtn.querySelector('.d2-toolbar__btn-icon')!
      const pluginsLabel = pluginsBtn.querySelector('.d2-toolbar__btn-label')!
      expect(pluginsIcon).not.toBeNull()
      expect(pluginsIcon.getAttribute('aria-hidden')).toBe('true')
      expect(pluginsIcon.innerHTML).toBe(TOOLBAR_PLUGINS_ICON_SVG)
      expect(pluginsLabel).not.toBeNull()
      expect(pluginsLabel.textContent).toBe('插件')
      expect(pluginsBtn.textContent).toBe('插件')

      // Preserves icon across language toggle and warning indicator updates
      toolbar.setLanguage('en')
      expect(pluginsBtn.querySelector('.d2-toolbar__btn-icon')).toBe(pluginsIcon)
      expect(pluginsIcon.innerHTML).toBe(TOOLBAR_PLUGINS_ICON_SVG)
      expect(pluginsBtn.textContent).toBe('Plugins')

      toolbar.setPluginsButtonState({ ready: true, hasWarning: true, open: false })
      expect(pluginsBtn.querySelector('.d2-toolbar__btn-icon')).toBe(pluginsIcon)
      expect(pluginsBtn.textContent).toBe('Plugins ⚠')

      toolbar.setLanguage('zh')
      toolbar.setPluginsButtonState({ ready: true, hasWarning: false, open: false })
      expect(pluginsBtn.textContent).toBe('插件')

      const dividerIdx = children.indexOf(divider)
      const pluginsBtnIdx = children.indexOf(pluginsBtn)
      const pluginSlotIdx = children.indexOf(pluginSlot)
      const diagBannerIdx = children.indexOf(diagBanner)

      expect(dividerIdx).toBe(3)
      expect(pluginsBtnIdx).toBe(4)
      expect(pluginSlotIdx).toBe(5)
      expect(diagBannerIdx).toBe(6)

      toolbar.setDiagBanner('Lag: 42ms')
      expect(diagBanner.hidden).toBe(false)
      expect(diagBanner.textContent).toBe('Lag: 42ms')
      toolbar.setDiagBanner(null)
      expect(diagBanner.hidden).toBe(true)

      toolbar.destroy()
    } finally {
      ;(globalThis as { document?: unknown }).document = prevDoc
    }
  })

  it('aligns play.html static #d2-toolbar markup and toolbar.css flex-start layout with runtime Toolbar structure', () => {
    const playHtml = readFileSync(resolve(process.cwd(), 'play.html'), 'utf8')
    const toolbarCss = readFileSync(
      resolve(process.cwd(), 'src/client/toolbar/toolbar.css'),
      'utf8',
    )

    expect(toolbarCss).toContain('justify-content: flex-start')
    expect(toolbarCss).toContain('.d2-toolbar__divider')
    expect(toolbarCss).toContain('.d2-toolbar__btn-icon')

    const langPos = playHtml.indexOf('id="d2-toolbar-lang-en"')
    const dividerPos = playHtml.indexOf('class="d2-toolbar__divider"')
    const pluginsBtnPos = playHtml.indexOf('id="d2-toolbar-plugins-btn"')
    const pluginSlotPos = playHtml.indexOf('id="d2-toolbar-plugin-slot"')

    expect(langPos).toBeGreaterThan(0)
    expect(dividerPos).toBeGreaterThan(langPos)
    expect(pluginsBtnPos).toBeGreaterThan(dividerPos)
    expect(pluginSlotPos).toBeGreaterThan(pluginsBtnPos)
    expect(playHtml).toContain(TOOLBAR_PLUGINS_ICON_SVG)
    expect(playHtml).toContain(TOOLBAR_CACHE_CLEAR_ICON_SVG)
    expect(playHtml).toContain('d2-toolbar__group--segmented')
    expect(toolbarCss).toContain('.d2-toolbar__group--segmented')
    expect(toolbarCss).toContain('.d2-toolbar__drop-set')
    expect(toolbarCss).toContain('.d2-toolbar__drop-unique')
    expect(toolbarCss).toContain('.d2-toolbar__drop-rune')
  })

  it('renders cache clear icon, segmented language group, plugin contribution icons, and D2 drop quality spans (#1020)', () => {
    const prevDoc = (globalThis as { document?: unknown }).document
    const head = new FakeElement('head')
    const body = new FakeElement('body')
    const container = new FakeElement('div')
    body.appendChild(container)
    ;(globalThis as { document?: unknown }).document = {
      head,
      body,
      createElement(tag: string) {
        return new FakeElement(tag)
      },
      getElementById(id: string) {
        return body.querySelector(`#${id}`) ?? head.querySelector(`#${id}`)
      },
    }

    try {
      const store = new SettingsStore({
        storage: new MemoryStorage(),
        defaultLang: 'zh',
        syncGlobalLang: false,
      })
      const toolbar = new Toolbar({
        container: container as unknown as HTMLElement,
        store,
      })
      const root = container.querySelector('#d2-toolbar')!
      const cacheClearBtn = root.querySelector('#d2-toolbar-cache-clear-btn')!
      expect(cacheClearBtn.querySelector('.d2-toolbar__btn-icon')!.innerHTML).toBe(
        TOOLBAR_CACHE_CLEAR_ICON_SVG,
      )
      expect(cacheClearBtn.textContent).toBe('清除缓存')

      const langGroup = root.children[2]!
      expect(langGroup.className).toContain('d2-toolbar__group--segmented')

      toolbar.addContribution({
        domId: 'd2-toolbar-plugin-kill-stats-open',
        kind: 'link',
        label: { zh: '击杀统计', en: 'Kill Stats' },
        iconSvg: TOOLBAR_KILL_STATS_ICON_SVG,
        href: '/stats/kill-stats.html',
      })
      const dropHandle = toolbar.addContribution({
        domId: 'd2-toolbar-plugin-drop-tracker-open',
        kind: 'link',
        label: { zh: '掉落 绿12 · 金3 · 符1', en: 'Drops S:12 · U:3 · R:1' },
        iconSvg: TOOLBAR_DROP_TRACKER_ICON_SVG,
        href: '/stats/drop-tracker.html',
      })

      const slot = root.querySelector('#d2-toolbar-plugin-slot')!
      expect(slot.children.length).toBe(2)
      const killLink = slot.children[0]!
      const dropLink = slot.children[1]!

      expect(killLink.querySelector('.d2-toolbar__btn-icon')!.innerHTML).toBe(
        TOOLBAR_KILL_STATS_ICON_SVG,
      )
      expect(killLink.textContent).toBe('击杀统计')

      expect(dropLink.querySelector('.d2-toolbar__btn-icon')!.innerHTML).toBe(
        TOOLBAR_DROP_TRACKER_ICON_SVG,
      )
      expect(dropLink.textContent).toBe('掉落 绿12 · 金3 · 符1')
      expect(dropLink.querySelector('.d2-toolbar__drop-set')!.textContent).toBe('绿12')
      expect(dropLink.querySelector('.d2-toolbar__drop-unique')!.textContent).toBe('金3')
      expect(dropLink.querySelector('.d2-toolbar__drop-rune')!.textContent).toBe('符1')

      // English drop summary format also parses into colored quality spans
      toolbar.setLanguage('en')
      dropHandle.update?.({
        label: { zh: '掉落 绿4 · 金2 · 符0', en: 'Drops S:4 · U:2 · R:0' },
      })
      expect(dropLink.textContent).toBe('Drops S:4 · U:2 · R:0')
      expect(dropLink.querySelector('.d2-toolbar__drop-set')!.textContent).toBe('S:4')
      expect(dropLink.querySelector('.d2-toolbar__drop-unique')!.textContent).toBe('U:2')
      expect(dropLink.querySelector('.d2-toolbar__drop-rune')!.textContent).toBe('R:0')

      toolbar.destroy()
    } finally {
      ;(globalThis as { document?: unknown }).document = prevDoc
    }
  })
})

// NOT 1.13c: toolbar fullscreen toggle (web-port affordance).
describe('Toolbar fullscreen toggle button', () => {
  function mountWithDocument(docExtras: Record<string, unknown>): {
    toolbar: Toolbar
    root: FakeElement
    restore: () => void
  } {
    const prevDoc = (globalThis as { document?: unknown }).document
    const head = new FakeElement('head')
    const body = new FakeElement('body')
    const container = new FakeElement('div')
    body.appendChild(container)
    const fakeDoc = {
      head,
      body,
      createElement(tag: string) {
        return new FakeElement(tag)
      },
      getElementById(id: string) {
        return body.querySelector(`#${id}`) ?? head.querySelector(`#${id}`)
      },
    }
    // Copy descriptors (not values) so the `fullscreenElement` getter stays live.
    Object.defineProperties(fakeDoc, Object.getOwnPropertyDescriptors(docExtras))
    ;(globalThis as { document?: unknown }).document = fakeDoc
    const store = new SettingsStore({
      storage: new MemoryStorage(),
      defaultLang: 'zh',
      syncGlobalLang: false,
    })
    const toolbar = new Toolbar({ container: container as unknown as HTMLElement, store })
    return {
      toolbar,
      root: container.querySelector('#d2-toolbar')!,
      restore: () => {
        toolbar.destroy()
        ;(globalThis as { document?: unknown }).document = prevDoc
      },
    }
  }

  function makeFullscreenDoc(opts: { reject?: Error } = {}) {
    const listeners = new Map<string, Set<() => void>>()
    const fire = (type: string): void => {
      for (const fn of listeners.get(type) ?? []) fn()
    }
    const state = { fullscreenElement: null as unknown }
    const documentElement = {
      requestFullscreen: vi.fn(async () => {
        if (opts.reject) throw opts.reject
        state.fullscreenElement = documentElement
        fire('fullscreenchange')
      }),
    }
    const extras = {
      documentElement,
      get fullscreenElement() {
        return state.fullscreenElement
      },
      exitFullscreen: vi.fn(async () => {
        state.fullscreenElement = null
        fire('fullscreenchange')
      }),
      addEventListener(type: string, fn: () => void) {
        const set = listeners.get(type) ?? new Set()
        set.add(fn)
        listeners.set(type, set)
      },
      removeEventListener(type: string, fn: () => void) {
        listeners.get(type)?.delete(fn)
      },
    }
    return { extras, state, documentElement, listeners, fire }
  }

  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  it('sits immediately after the FPS selector', () => {
    const fs = makeFullscreenDoc()
    const { root, restore } = mountWithDocument(fs.extras)
    try {
      const fpsSelect = root.querySelector('#d2-toolbar-worldfps-select')!
      const btn = root.querySelector('#d2-toolbar-fullscreen-btn')!
      expect(btn).not.toBeNull()
      const group = fpsSelect.parentNode!
      expect(btn.parentNode).toBe(group)
      expect(group.children.indexOf(btn)).toBe(group.children.indexOf(fpsSelect) + 1)
      expect(btn.className).toBe('d2-toolbar__btn')
      expect(btn.disabled).toBe(false)
      expect(btn.textContent).toBe('全屏')
      expect(btn.querySelector('.d2-toolbar__btn-icon')!.innerHTML).toBe(
        TOOLBAR_FULLSCREEN_ENTER_ICON_SVG,
      )
      expect(btn.getAttribute('aria-pressed')).toBe('false')
    } finally {
      restore()
    }
  })

  it('toggles fullscreen and follows browser-driven exits (Esc)', async () => {
    const fs = makeFullscreenDoc()
    const { toolbar, root, restore } = mountWithDocument(fs.extras)
    try {
      const btn = root.querySelector('#d2-toolbar-fullscreen-btn')!
      btn.click()
      expect(fs.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' })
      await flush()
      expect(btn.textContent).toBe('退出全屏')
      expect(btn.getAttribute('aria-pressed')).toBe('true')
      expect(btn.className).toContain('d2-toolbar__btn--active')
      expect(btn.querySelector('.d2-toolbar__btn-icon')!.innerHTML).toBe(
        TOOLBAR_FULLSCREEN_EXIT_ICON_SVG,
      )

      toolbar.setLanguage('en')
      expect(btn.textContent).toBe('Exit Fullscreen')

      // Esc handled by the browser: fullscreenElement cleared + fullscreenchange.
      fs.state.fullscreenElement = null
      fs.fire('fullscreenchange')
      expect(btn.textContent).toBe('Fullscreen')
      expect(btn.getAttribute('aria-pressed')).toBe('false')

      // Button exit path.
      btn.click()
      await flush()
      expect(btn.getAttribute('aria-pressed')).toBe('true')
      btn.click()
      expect(fs.extras.exitFullscreen).toHaveBeenCalledTimes(1)
      await flush()
      expect(btn.getAttribute('aria-pressed')).toBe('false')
    } finally {
      restore()
    }
    expect(fs.listeners.get('fullscreenchange')?.size).toBe(0)
  })

  it('reports a rejected request instead of swallowing it', async () => {
    const fs = makeFullscreenDoc({ reject: new Error('Permissions check failed') })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { root, restore } = mountWithDocument(fs.extras)
    try {
      root.querySelector('#d2-toolbar-fullscreen-btn')!.click()
      await flush()
      expect(errSpy).toHaveBeenCalledWith(
        '[toolbar]',
        '全屏失败 (enter): Permissions check failed',
      )
    } finally {
      restore()
      errSpy.mockRestore()
    }
  })

  it('is disabled when the document has no Fullscreen API', () => {
    const { root, restore } = mountWithDocument({})
    try {
      const btn = root.querySelector('#d2-toolbar-fullscreen-btn')!
      expect(btn.disabled).toBe(true)
      btn.click()
    } finally {
      restore()
    }
  })
})
