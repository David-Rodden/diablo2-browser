import { describe, expect, it, vi } from 'vitest'
import { mountPilotBanner } from '../../src/client/guide/pilot-banner.ts'

interface FakeNode {
  className: string
  textContent: string
  readonly style: Record<string, string>
  readonly children: FakeNode[]
  parent: FakeNode | null
  append: (...nodes: FakeNode[]) => void
  appendChild: (node: FakeNode) => void
  remove: () => void
}

const node = (): FakeNode => {
  const self: FakeNode = {
    className: '',
    textContent: '',
    style: {},
    children: [],
    parent: null,
    append: (...nodes) => nodes.forEach((child) => self.appendChild(child)),
    appendChild: (child) => {
      child.parent = self
      self.children.push(child)
    },
    remove: () => {
      self.parent?.children.splice(self.parent.children.indexOf(self), 1)
    },
  }
  return self
}

describe('autopilot banner', () => {
  it('shows what the autopilot is doing over open panels, and only one per stage', () => {
    vi.useFakeTimers()
    vi.stubGlobal('document', { createElement: node })
    const stage = node()
    let shown = false
    const read = () => ({ shown, status: 'Buying potions and portals', hint: 'Enter Flayer Jungle' })
    mountPilotBanner(stage as unknown as HTMLElement, read)
    mountPilotBanner(stage as unknown as HTMLElement, read)
    vi.advanceTimersByTime(300)
    const [banner] = stage.children
    expect([stage.children.length, banner!.style.display]).toEqual([1, 'none'])
    shown = true
    vi.advanceTimersByTime(300)
    expect([banner!.style.display, ...banner!.children.map((line) => line.textContent)]).toEqual(['block', 'Autopilot: Buying potions and portals', 'Enter Flayer Jungle'])
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
