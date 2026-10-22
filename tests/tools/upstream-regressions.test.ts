import { describe, expect, it } from 'vitest'
import { compareReports, summary, type VitestReport } from '../../tools/upstream-regressions.ts'

const report = (root: string, files: Record<string, Record<string, string> | string>): VitestReport => ({
  testResults: Object.entries(files).map(([file, tests]) =>
    typeof tests === 'string'
      ? { name: `${root}/tests/${file}`, status: tests, assertionResults: [] }
      : { name: `${root}/tests/${file}`, status: 'passed', assertionResults: Object.entries(tests).map(([fullName, status]) => ({ fullName, status })) },
  ),
})

describe('upstream regressions', () => {
  const theirs = report('/w/theirs', { 'a.test.ts': { walks: 'passed', talks: 'failed' }, 'b.test.ts': { loads: 'passed' }, 'gone.test.ts': { old: 'passed' } })

  it('lists only his tests that pass on his snapshot and fail here', () => {
    const ours = report('/w/ours', { 'a.test.ts': { walks: 'failed', talks: 'passed' }, 'b.test.ts': { loads: 'passed' } })
    expect(compareReports(theirs, ours)).toEqual({ compared: 3, regressions: ['tests/a.test.ts > walks'], fixed: ['tests/a.test.ts > talks'] })
  })

  it('counts a file that no longer loads as failing every test in it', () => {
    const ours = report('/w/ours', { 'a.test.ts': { walks: 'passed', talks: 'failed' }, 'b.test.ts': 'failed' })
    expect(compareReports(theirs, ours).regressions).toEqual(['tests/b.test.ts > loads'])
  })

  it('writes a short summary', () => {
    expect(summary({ compared: 4, regressions: [], fixed: [] })).toContain('All 4 of his tests that pass on his snapshot still pass here.')
    expect(summary({ compared: 4, regressions: ['tests/a.test.ts > walks'], fixed: [] })).toContain('- tests/a.test.ts > walks')
  })
})
