import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

export interface Badge {
  readonly schemaVersion: 1
  readonly label: string
  readonly message: string
  readonly color: string
}

export interface TestResults {
  readonly numPassedTests: number
  readonly numFailedTests: number
}

const badge = (label: string, message: string, color: string): Badge => ({ schemaVersion: 1, label, message, color })
const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

export const testsBadge = ({ numPassedTests, numFailedTests }: TestResults): Badge =>
  numFailedTests > 0 ? badge('mod tests', `${numFailedTests} failing of ${numPassedTests + numFailedTests}`, 'red') : badge('mod tests', `${numPassedTests} passing`, 'brightgreen')

export const pluginsBadge = (count: number): Badge => badge('plugins', plural(count, 'mod'), 'b8860b')

export const upstreamBadge = (pending: number, snapshot: string | null): Badge =>
  pending > 0 ? badge('upstream', `${plural(pending, 'snapshot')} to merge`, 'orange') : badge('upstream', snapshot ? `merged ${snapshot}` : 'merged', 'brightgreen')

export const bundleBadge = (gzipBytes: number): Badge => badge('client js', `${(gzipBytes / 1024 / 1024).toFixed(2)} MB gzip`, gzipBytes > 8 * 1024 * 1024 ? 'orange' : 'blue')

export const snapshotDate = (subject: string): string | null => /\((\d{4}-\d{2}-\d{2})\)/.exec(subject)?.[1] ?? null

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const write = (dir: string, name: string, value: Badge) => writeFileSync(join(dir, `${name}.json`), JSON.stringify(value) + '\n')

function checkBadges(dir: string, results: string): void {
  write(dir, 'tests', testsBadge(JSON.parse(readFileSync(results, 'utf8')) as TestResults))
  write(dir, 'plugins', pluginsBadge(readdirSync('plugins', { withFileTypes: true }).filter((d) => d.isDirectory()).length))
  write(dir, 'upstream', upstreamBadge(Number(git('rev-list', '--count', '--first-parent', 'origin/main..origin/upstream')), snapshotDate(git('log', '-1', '--format=%s', 'origin/upstream'))))
}

function buildBadges(dir: string, dist: string): void {
  const assets = join(dist, 'assets')
  write(dir, 'bundle', bundleBadge(readdirSync(assets).filter((f) => f.endsWith('.js')).reduce((n, f) => n + gzipSync(readFileSync(join(assets, f))).length, 0)))
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [kind, dir, input] = process.argv.slice(2)
  if (!dir || !input || (kind !== 'check' && kind !== 'build')) throw new Error('usage: badges.ts check|build <out-dir> <test-results.json|dist>')
  mkdirSync(dir, { recursive: true })
  if (kind === 'check') checkBadges(dir, input)
  else buildBadges(dir, input)
}
