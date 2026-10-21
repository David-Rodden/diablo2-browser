import { describe, expect, it } from 'vitest'
import { branchesToPrune, type Branch, type Pull } from '../../tools/prune-branches.ts'

const NOW = Date.UTC(2026, 9, 20)
const branch = (name: string, sha = name, daysOld = 1, inMain = false): Branch => ({ name, sha, committedMs: NOW - daysOld * 86_400_000, inMain })
const pull = (headRefName: string, state: Pull['state'], headRefOid = headRefName, isCrossRepository = false): Pull => ({ headRefName, headRefOid, state, isCrossRepository })

describe('branch pruning', () => {
  it('never touches main, upstream or backups', () => {
    expect(branchesToPrune([branch('main', 'a', 90, true), branch('upstream', 'b', 90), branch('backup/old', 'c', 90)], [pull('main', 'MERGED', 'a')], NOW)).toEqual([])
  })

  it('deletes branches whose PR was merged or closed at the same commit', () => {
    expect(branchesToPrune([branch('sync/b8b8d1f'), branch('dropped')], [pull('sync/b8b8d1f', 'MERGED'), pull('dropped', 'CLOSED')], NOW)).toEqual([
      { name: 'sync/b8b8d1f', reason: 'PR merged' },
      { name: 'dropped', reason: 'PR closed' },
    ])
  })

  it('keeps branches with an open PR or new commits after the PR closed', () => {
    expect(branchesToPrune([branch('live'), branch('reworked', 'new', 30)], [pull('live', 'OPEN'), pull('live', 'MERGED'), pull('reworked', 'CLOSED', 'old')], NOW)).toEqual([])
  })

  it('deletes branches already in main and long-idle branches without a PR', () => {
    expect(branchesToPrune([branch('landed', 'x', 0, true), branch('idle', 'y', 8), branch('fresh', 'z', 2)], [], NOW)).toEqual([
      { name: 'landed', reason: 'already in main' },
      { name: 'idle', reason: 'no PR, idle 8 days' },
    ])
  })

  it('ignores PRs opened from forks with the same branch name', () => {
    expect(branchesToPrune([branch('main-fix')], [pull('main-fix', 'MERGED', 'main-fix', true)], NOW)).toEqual([])
  })
})
