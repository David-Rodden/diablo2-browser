import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const KEEP = /^(main|upstream|backup\/.+)$/
const IDLE_DAYS = 7
const DAY_MS = 86_400_000

export interface Branch {
  readonly name: string
  readonly sha: string
  readonly committedMs: number
  readonly inMain: boolean
}

export interface Pull {
  readonly headRefName: string
  readonly headRefOid: string
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED'
  readonly isCrossRepository: boolean
}

export interface Prune {
  readonly name: string
  readonly reason: string
}

const reasonFor = (branch: Branch, pulls: readonly Pull[], nowMs: number): string | null => {
  const own = pulls.filter((p) => !p.isCrossRepository && p.headRefName === branch.name)
  if (KEEP.test(branch.name) || own.some((p) => p.state === 'OPEN')) return null
  const finished = own.find((p) => p.headRefOid === branch.sha)
  if (finished) return finished.state === 'MERGED' ? 'PR merged' : 'PR closed'
  if (branch.inMain) return 'already in main'
  return own.length === 0 && nowMs - branch.committedMs > IDLE_DAYS * DAY_MS ? `no PR, idle ${Math.floor((nowMs - branch.committedMs) / DAY_MS)} days` : null
}

export const branchesToPrune = (branches: readonly Branch[], pulls: readonly Pull[], nowMs: number): Prune[] =>
  branches.flatMap((branch) => {
    const reason = reasonFor(branch, pulls, nowMs)
    return reason ? [{ name: branch.name, reason }] : []
  })

const run = (command: string, ...args: string[]) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

function remoteBranches(): Branch[] {
  const merged = new Set(run('git', 'for-each-ref', '--merged', 'origin/main', '--format=%(refname:lstrip=3)', 'refs/remotes/origin').split('\n'))
  return run('git', 'for-each-ref', '--format=%(refname:lstrip=3)\t%(objectname)\t%(committerdate:unix)', 'refs/remotes/origin')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t') as [string, string, string])
    .filter(([name]) => name !== 'HEAD')
    .map(([name, sha, seconds]) => ({ name, sha, committedMs: Number(seconds) * 1000, inMain: merged.has(name) }))
}

function main(dryRun: boolean): void {
  const pulls = JSON.parse(run('gh', 'pr', 'list', '--state', 'all', '--limit', '1000', '--json', 'headRefName,headRefOid,state,isCrossRepository')) as Pull[]
  const prunes = branchesToPrune(remoteBranches(), pulls, Date.now())
  prunes.forEach((p) => console.log(`${dryRun ? 'would delete' : 'deleting'} ${p.name} (${p.reason})`))
  if (prunes.length === 0) console.log('no stale branches')
  if (!dryRun && prunes.length > 0) run('git', 'push', 'origin', '--delete', ...prunes.map((p) => p.name))
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true')
