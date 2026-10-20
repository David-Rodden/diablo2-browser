import { describe, expect, it } from 'vitest'
import { SUMMARY_FOOTER, groupByArea, isGenerated, parseNumstat, renderSummary } from '../../tools/pr-summary.ts'

describe('pr summary', () => {
  const files = parseNumstat('10\t2\tsrc/client/guide/route.ts\n3\t1\tsrc/client/main.ts\n-\t-\tpublic/icon.png\n4\t0\tMODS.md\n')

  it('groups changed files by area, biggest first', () => {
    expect(groupByArea(files)).toEqual([
      { area: 'src/client', files: 2, added: 13, removed: 3 },
      { area: 'root', files: 1, added: 4, removed: 0 },
      { area: 'public', files: 1, added: 0, removed: 0 },
    ])
  })

  it('renders the overview, totals and the upstream files it touches', () => {
    const body = renderSummary({ overview: 'Guide follows the quest log.', files, upstreamFiles: new Set(['src/client/main.ts']) })
    expect(body).toContain('Guide follows the quest log.')
    expect(body).toContain('**Files** · 4 changed · +17 −3')
    expect(body).toContain('**Upstream files touched:** `src/client/main.ts`')
    expect(body.endsWith(SUMMARY_FOOTER)).toBe(true)
  })

  it('only rewrites empty or previously generated bodies', () => {
    expect([isGenerated(''), isGenerated(null), isGenerated(`old\n${SUMMARY_FOOTER}`), isGenerated('Written by hand.')]).toEqual([true, true, true, false])
  })
})
