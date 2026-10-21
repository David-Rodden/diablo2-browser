import { describe, expect, it } from 'vitest'
import { lootAlert } from '../../plugins/loot-alerts/alerts.ts'
import { lootAlertsPlugin } from '../../plugins/loot-alerts/index.ts'
import { PluginHost } from '../../src/client/plugin-host/plugin-host.ts'
import { PluginConfigStore } from '../../src/client/plugin-host/plugin-config-store.ts'
import type { PluginSessionView, PluginToast } from '../../src/client/plugin-host/api.ts'
import type { ServerEvent } from '../../src/netproto/index.ts'

const BLOOD_MOOR = 2

describe('loot alerts', () => {
  it('announces new unique, set and rune drops with their kind and area', () => {
    expect(lootAlert(0, { id: 1, code: 'r08', quality: 2 }, 'notable', BLOOD_MOOR)).toEqual({ title: 'Ral Rune', detail: 'Rune · Blood Moor', color: 'orange' })
    expect(lootAlert(0, { id: 2, code: 'cap', quality: 7 }, 'notable', BLOOD_MOOR)).toMatchObject({ detail: 'Unique · Blood Moor', color: 'gold' })
    expect(lootAlert(0, { id: 3, code: 'lrg', quality: 5 }, 'notable', BLOOD_MOOR)).toMatchObject({ detail: 'Set item · Blood Moor', color: 'green' })
  })

  it('skips items already on the ground, dropped by the player, or below the chosen level', () => {
    expect(lootAlert(3, { id: 1, code: 'r08' }, 'notable', BLOOD_MOOR)).toBeNull()
    expect(lootAlert(2, { id: 1, code: 'r08' }, 'notable', BLOOD_MOOR)).toBeNull()
    expect(lootAlert(0, { id: 4, code: 'cap', quality: 6 }, 'notable', BLOOD_MOOR)).toBeNull()
    expect(lootAlert(0, { id: 4, code: 'cap', quality: 6 }, 'valuable', BLOOD_MOOR)).toMatchObject({ color: 'yellow' })
    expect(lootAlert(0, { id: 5, code: 'cm1', quality: 4 }, 'valuable', BLOOD_MOOR)).toMatchObject({ detail: 'Charm · Blood Moor', color: 'blue' })
    expect(lootAlert(0, { id: 2, code: 'cap', quality: 7 }, 'runes', BLOOD_MOOR)).toBeNull()
    expect(lootAlert(0, { id: 6, code: 'hp1', quality: 2 }, 'valuable', BLOOD_MOOR)).toBeNull()
  })

  it('shows each dropped item once and nothing after the plugin is turned off', async () => {
    const listeners = new Set<(ev: ServerEvent) => void>()
    const shown: PluginToast[] = []
    const session = { phase: 'ingame', world: { areaId: BLOOD_MOOR }, loginHost: null, getSnapshot: () => ({}), onServerEvent: (cb: (ev: ServerEvent) => void) => (listeners.add(cb), () => listeners.delete(cb)), onStateChange: () => () => {} } as unknown as PluginSessionView
    const store = { map: new Map<string, string>(), getItem(k: string) { return this.map.get(k) ?? null }, setItem(k: string, v: string) { this.map.set(k, v) }, removeItem(k: string) { this.map.delete(k) } }
    const host = new PluginHost({ plugins: [lootAlertsPlugin], configStore: new PluginConfigStore([lootAlertsPlugin], { storage: store }), session, toolbar: { setPluginsButtonState() {}, addContribution: () => () => {} }, autoStart: false, notify: { show: (t) => void shown.push(t) } })
    await host.start()
    await host.setEnabled('loot-alerts', true)
    const drop = { type: 'ItemEvent', action: 0, container: 'ground', item: { id: 9, code: 'r01', quality: 2 } } as unknown as ServerEvent
    listeners.forEach((cb) => {
      cb(drop)
      cb(drop)
    })
    expect(shown.map((t) => t.title)).toEqual(['El Rune'])
    await host.setEnabled('loot-alerts', false)
    listeners.forEach((cb) => cb({ ...drop, item: { id: 10, code: 'r02' } } as unknown as ServerEvent))
    expect(shown).toHaveLength(1)
  })
})
