import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const SUMMARY_FOOTER = '<sub>Summary generated from the diff; it refreshes on every push.</sub>'
const MODELS_URL = 'https://models.github.ai/inference/chat/completions'
const MODEL = 'openai/gpt-4.1-mini'
const DIFF_BUDGET = 24_000
const SYSTEM_PROMPT = [
  'You summarize pull requests for a Diablo II browser client.',
  'Write two to four plain sentences on what changed and why it matters to a player or maintainer, then up to five short bullets of notable details.',
  'Be concrete and factual, no hype, no headings, no closing remarks.',
].join(' ')

export interface FileChange {
  readonly path: string
  readonly added: number
  readonly removed: number
}

export interface SummaryInput {
  readonly overview: string
  readonly commits: readonly string[]
  readonly files: readonly FileChange[]
  readonly upstreamFiles: ReadonlySet<string>
}

export const parseNumstat = (numstat: string): FileChange[] =>
  numstat
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [added = '0', removed = '0', ...path] = line.split('\t')
      return { path: path.join('\t'), added: Number(added) || 0, removed: Number(removed) || 0 }
    })

const areaOf = (path: string) => {
  const parts = path.split('/')
  return parts.length > 2 && (parts[0] === 'src' || parts[0] === 'tests') ? `${parts[0]}/${parts[1]}` : parts.length > 1 ? parts[0]! : 'root'
}

export const groupByArea = (files: readonly FileChange[]): { readonly area: string; readonly files: number; readonly added: number; readonly removed: number }[] =>
  [...new Set(files.map((f) => areaOf(f.path)))]
    .map((area) => {
      const inArea = files.filter((f) => areaOf(f.path) === area)
      return { area, files: inArea.length, added: inArea.reduce((n, f) => n + f.added, 0), removed: inArea.reduce((n, f) => n + f.removed, 0) }
    })
    .sort((a, b) => b.added + b.removed - (a.added + a.removed))

export function renderSummary({ overview, commits, files, upstreamFiles }: SummaryInput): string {
  const total = files.reduce((n, f) => ({ added: n.added + f.added, removed: n.removed + f.removed }), { added: 0, removed: 0 })
  const touched = files.map((f) => f.path).filter((path) => upstreamFiles.has(path))
  return [
    overview.trim(),
    '',
    `**Commits**`,
    ...commits.map((c) => `- ${c}`),
    '',
    `**Files** · ${files.length} changed · +${total.added} −${total.removed}`,
    '',
    '| Area | Files | + | − |',
    '| --- | ---: | ---: | ---: |',
    ...groupByArea(files).map((a) => `| \`${a.area}\` | ${a.files} | ${a.added} | ${a.removed} |`),
    '',
    touched.length > 0 ? `**Upstream files touched:** ${touched.map((p) => `\`${p}\``).join(', ')}` : '**Upstream files touched:** none',
    '',
    SUMMARY_FOOTER,
  ].join('\n')
}

export const isGenerated = (body: string | null | undefined): boolean => !body?.trim() || body.includes(SUMMARY_FOOTER)

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

async function modelOverview(prompt: string, token: string | undefined): Promise<string | null> {
  if (!token) return null
  try {
    const response = await fetch(MODELS_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, temperature: 0.2, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }] }),
    })
    if (!response.ok) {
      console.error(`model request failed: ${response.status} ${await response.text()}`)
      return null
    }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (error) {
    console.error(`model request failed: ${String(error)}`)
    return null
  }
}

async function main(base: string, head: string, title: string): Promise<void> {
  if (!isGenerated(process.env.PR_BODY)) {
    console.error('the PR has a hand-written body, leaving it alone')
    return
  }
  const range = `${base}...${head}`
  const commits = git('log', '--reverse', '--format=%s (%h)', range).split('\n').filter(Boolean)
  const files = parseNumstat(git('diff', '--numstat', range))
  const upstreamFiles = new Set(git('ls-tree', '-r', '--name-only', 'origin/upstream').split('\n'))
  const diff = git('diff', '--stat', range) + '\n' + git('diff', '--unified=2', range, '--', '.', ':!*.gen.ts', ':!package-lock.json')
  const prompt = [`Title: ${title}`, '', 'Commits:', ...commits, '', 'Diff:', diff.slice(0, DIFF_BUDGET)].join('\n')
  const fallback = commits.length === 1 ? `${commits[0]!.replace(/ \([0-9a-f]+\)$/, '')}.` : `${title}: ${commits.length} commits.`
  const overview = (await modelOverview(prompt, process.env.GITHUB_TOKEN)) ?? fallback
  process.stdout.write(renderSummary({ overview, commits, files, upstreamFiles }) + '\n')
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [base, head, title = ''] = process.argv.slice(2)
  if (!base || !head) throw new Error('usage: pr-summary.ts <base> <head> [title]')
  await main(base, head, title)
}
