/**
 * Extended Viewports Plugin (`plugins/extended-viewports/index.ts` — Issue #716).
 *
 * Isolates the non-1.13c extended resolutions (`1024x768`, `1068x600`, `1280x720`)
 * outside core `src/`. When enabled, unlocks all 5 resolutions in the toolbar viewport
 * selector; when disabled, `PluginHost` restricts allowed viewports to native 1.13c
 * `640x480` and `800x600` and clamps any extended resolution back to `800x600`.
 */

import {
  VALID_VIEWPORT_RESOLUTIONS,
  formatViewportLabel,
  type D2WebPlugin,
  type PluginContext,
  type PluginInstance,
  type PluginStatus,
  type PluginToolbarSelectOption,
  type ViewportResolution,
} from '../../src/client/plugin-host/api.ts'

const VIEWPORT_SELECT_OPTIONS: readonly PluginToolbarSelectOption[] =
  VALID_VIEWPORT_RESOLUTIONS.map((vp) => {
    const label = formatViewportLabel(vp)
    return {
      value: vp,
      label: {
        zh: label,
        en: label,
      },
    }
  })

function isViewportResolution(value: unknown): value is ViewportResolution {
  return (
    typeof value === 'string' &&
    (VALID_VIEWPORT_RESOLUTIONS as readonly string[]).includes(value)
  )
}

export interface ExtendedViewportsPluginInstance extends PluginInstance {
  getViewport(): ViewportResolution
  setViewport(viewport: ViewportResolution): void
}

export function createExtendedViewportsPlugin(): D2WebPlugin {
  return {
    id: 'extended-viewports',
    name: {
      zh: '扩展高分与宽屏视口',
      en: 'Extended Viewports',
    },
    description: {
      zh: '非 1.13c 增强：解锁 1024×768、1068×600 (16:9) 与 1280×720 (HD) 扩展视口。关闭插件后仅开放 1.13c 原版 640×480 与 800×600 分辨率，并自动回退至 800×600。',
      en: 'Non-1.13c enhancement: unlocks 1024×768, 1068×600 (16:9), and 1280×720 (HD) viewports. When disabled, restricts the client to native 1.13c 640×480 and 800×600 resolutions.',
    },
    defaultEnabled: true,
    settings: [
      {
        kind: 'select',
        key: 'viewport',
        label: {
          zh: '当前视口分辨率',
          en: 'Active Viewport',
        },
        default: '800x600',
        options: VIEWPORT_SELECT_OPTIONS,
      },
    ],
    activate(ctx: PluginContext): ExtendedViewportsPluginInstance {
      // Unlock all 5 viewport profiles (native 640x480, 800x600 + extended 1024x768, 1068x600, 1280x720)
      ctx.client.setAllowedViewports(VALID_VIEWPORT_RESOLUTIONS)

      const storedSetting = ctx.settings.get('viewport')
      const initialViewport: ViewportResolution = isViewportResolution(storedSetting)
        ? storedSetting
        : '800x600'

      ctx.client.setViewport(initialViewport)

      const unsubClient = ctx.client.subscribeViewport((clientVp) => {
        if (ctx.settings.get('viewport') !== clientVp) {
          ctx.settings.set('viewport', clientVp)
        }
        ctx.notifyStatusChanged()
      })

      const unsubSettings = ctx.settings.subscribe((key) => {
        if (key === 'viewport') {
          const next = ctx.settings.get('viewport')
          if (isViewportResolution(next)) {
            ctx.client.setViewport(next)
            ctx.notifyStatusChanged()
          }
        }
      })

      const getStatus = (): PluginStatus => {
        const vp = ctx.client.getViewport()
        const label = formatViewportLabel(vp)
        return {
          level: 'ok',
          text: {
            zh: `当前：${label}`,
            en: `Viewport: ${label}`,
          },
        }
      }

      return {
        getViewport: () => ctx.client.getViewport(),
        setViewport: (viewport: ViewportResolution) => {
          if (!isViewportResolution(viewport)) {
            throw new Error(`Invalid viewport resolution: ${String(viewport)}`)
          }
          ctx.settings.set('viewport', viewport)
        },
        getStatus,
        deactivate(): void {
          unsubClient()
          unsubSettings()
        },
      }
    },
  }
}

export const extendedViewportsPlugin: D2WebPlugin = createExtendedViewportsPlugin()
