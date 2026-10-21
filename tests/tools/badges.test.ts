import { describe, expect, it } from 'vitest'
import { bundleBadge, pluginsBadge, snapshotDate, testsBadge, upstreamBadge } from '../../tools/badges.ts'

describe('readme badges', () => {
  it('reports passing and failing mod tests', () => {
    expect(testsBadge({ numPassedTests: 293, numFailedTests: 0 })).toMatchObject({ label: 'mod tests', message: '293 passing', color: 'brightgreen' })
    expect(testsBadge({ numPassedTests: 290, numFailedTests: 3 })).toMatchObject({ message: '3 failing of 293', color: 'red' })
  })

  it('counts plugins and sizes the bundle', () => {
    expect(pluginsBadge(19).message).toBe('19 mods')
    expect(bundleBadge(3.5 * 1024 * 1024)).toMatchObject({ message: '3.50 MB gzip', color: 'blue' })
  })

  it('shows whether the latest upstream snapshot is merged', () => {
    expect(snapshotDate('chore: publish d2web source snapshot (2026-10-20)')).toBe('2026-10-20')
    expect(upstreamBadge(0, '2026-10-20')).toMatchObject({ message: 'merged 2026-10-20', color: 'brightgreen' })
    expect(upstreamBadge(2, '2026-10-21')).toMatchObject({ message: '2 snapshots to merge', color: 'orange' })
  })
})
