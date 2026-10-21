import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(__dirname, '../../tools/sync-upstream.sh')
const TRAINER = resolve(__dirname, '../../tools/train-rerere.sh')
const ROOT = resolve(__dirname, '../..')
const IDENTITY = { GIT_AUTHOR_NAME: 'Tester', GIT_AUTHOR_EMAIL: 'tester@example.com', GIT_COMMITTER_NAME: 'Tester', GIT_COMMITTER_EMAIL: 'tester@example.com' }
const roots: string[] = []

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: { ...process.env, ...IDENTITY }, encoding: 'utf8' }).trim()

const writeFiles = (dir: string, files: Record<string, string>) =>
  Object.entries(files).forEach(([path, content]) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  })

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'sync-upstream-'))
  roots.push(root)
  const [theirs, origin, work] = ['theirs', 'origin.git', 'work'].map((name) => join(root, name))
  git(root, 'init', '-q', '-b', 'main', theirs)
  git(root, 'init', '-q', '--bare', origin)

  const publish = (files: Record<string, string>, label: string) => {
    git(theirs, 'checkout', '-q', '--orphan', `snap-${label}`)
    git(theirs, 'rm', '-r', '-q', '--cached', '--ignore-unmatch', '.')
    git(theirs, 'clean', '-fdq')
    writeFiles(theirs, files)
    git(theirs, 'add', '-A')
    git(theirs, 'commit', '-q', '-m', `chore: publish d2web source snapshot (${label})`)
    git(theirs, 'branch', '-f', 'main', 'HEAD')
  }

  const base = { 'README.md': 'his readme\n', 'src/engine.ts': 'engine v1\n', '.gitea/ci.yml': 'ci v1\n', 'src/gen.ts': 'generated v1\n' }
  publish(base, '1')
  git(root, 'clone', '-q', origin, work)
  git(work, 'fetch', '-q', theirs, 'main')
  git(work, 'checkout', '-q', '-b', 'upstream', 'FETCH_HEAD')
  git(work, 'checkout', '-q', '-b', 'main')
  writeFiles(work, { 'README.md': 'my readme\n', 'src/mod.ts': 'my mod\n', '.upstream-filter': 'drop .gitea\nkeep README.md\ngenerated src/gen.ts\n' })
  git(work, 'rm', '-r', '-q', '.gitea')
  git(work, 'add', '-A')
  git(work, 'commit', '-q', '-m', 'My changes')
  git(work, 'push', '-q', 'origin', 'main', 'upstream')

  const sync = () => spawnSync('bash', [SCRIPT, '--merge'], { cwd: work, env: { ...process.env, ...IDENTITY, UPSTREAM_URL: theirs }, encoding: 'utf8' })
  const read = (path: string) => (existsSync(join(work, path)) ? readFileSync(join(work, path), 'utf8') : null)
  return { theirs, work, base, publish, sync, read }
}

afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

describe('sync-upstream', () => {
  it('stacks a new snapshot onto upstream and merges it without conflicts', () => {
    const s = setup()
    s.publish({ ...s.base, 'src/engine.ts': 'engine v2\n' }, '2')
    const result = s.sync()
    expect([result.status, result.stderr]).toEqual([0, ''])
    expect(result.stdout).toContain('new snapshot')
    expect(s.read('src/engine.ts')).toBe('engine v2\n')
    expect(s.read('src/mod.ts')).toBe('my mod\n')
    expect(git(s.work, 'log', '--format=%s', '-2', 'upstream').split('\n')).toEqual(['chore: publish d2web source snapshot (2)', 'chore: publish d2web source snapshot (1)'])
  })

  it('never brings back dropped paths, even when upstream changes them', () => {
    const s = setup()
    s.publish({ ...s.base, '.gitea/ci.yml': 'ci v2\n', '.gitea/extra.yml': 'new\n' }, '2')
    expect(s.sync().status).toBe(0)
    expect([s.read('.gitea/ci.yml'), s.read('.gitea/extra.yml')]).toEqual([null, null])
    expect(git(s.work, 'ls-tree', '-r', '--name-only', 'upstream')).not.toContain('.gitea/extra.yml')
  })

  it('keeps our version of kept paths when upstream edits them', () => {
    const s = setup()
    s.publish({ ...s.base, 'README.md': 'his new readme\n' }, '2')
    const result = s.sync()
    expect([result.status, result.stderr]).toEqual([0, ''])
    expect(s.read('README.md')).toBe('my readme\n')
  })

  it('resets regenerated files instead of refusing to merge', () => {
    const s = setup()
    writeFiles(s.work, { 'src/gen.ts': 'locally rebaked\n' })
    s.publish({ ...s.base, 'src/gen.ts': 'generated v2\n' }, '2')
    expect(s.sync().status).toBe(0)
    expect(s.read('src/gen.ts')).toBe('generated v2\n')
  })

  it('does nothing when there is no new snapshot', () => {
    const s = setup()
    expect(s.sync().status).toBe(0)
    const head = git(s.work, 'rev-parse', 'HEAD')
    const result = s.sync()
    expect([result.status, result.stdout.trim()]).toEqual([0, 'already on the latest snapshot: chore: publish d2web source snapshot (1)'])
    expect(git(s.work, 'rev-parse', 'HEAD')).toBe(head)
  })

  it('records the source snapshot and reapplies new rules without calling it a new snapshot', () => {
    const s = setup()
    s.publish({ ...s.base, 'docs/extra.md': 'docs\n' }, '2')
    expect(s.sync().status).toBe(0)
    const raw = git(s.theirs, 'rev-parse', 'main')
    expect(git(s.work, 'log', '-1', '--format=%(trailers:key=Snapshot,valueonly)', 'upstream')).toBe(raw)
    writeFiles(s.work, { '.upstream-filter': 'drop .gitea\ndrop docs\nkeep README.md\ngenerated src/gen.ts\n' })
    git(s.work, 'rm', '-r', '-q', 'docs')
    git(s.work, 'add', '-A')
    git(s.work, 'commit', '-q', '-m', 'Drop docs')
    const result = s.sync()
    expect([result.status, result.stderr]).toEqual([0, ''])
    expect(result.stdout).toContain('reapplied .upstream-filter')
    expect(s.read('docs/extra.md')).toBeNull()
  })

  it('translates english paths with the dictionary and lists the Chinese that is left', () => {
    const s = setup()
    writeFiles(s.work, { '.upstream-filter': 'drop .gitea\nkeep README.md\ngenerated src/gen.ts\nenglish page.html\n', 'tools/english.tsv': '插件\tPlugins\n' })
    git(s.work, 'add', '-A')
    git(s.work, 'commit', '-q', '-m', 'English')
    s.publish({ ...s.base, 'page.html': '<b>插件</b>\n<i>未连接</i>\n' }, '2')
    const result = s.sync()
    expect([result.status, result.stderr]).toEqual([0, ''])
    expect(s.read('page.html')).toBe('<b>Plugins</b>\n<i>未连接</i>\n')
    expect(result.stdout).toContain('page.html:2: <i>未连接</i>')
  })

  it('stops with a clear message when our edits really conflict', () => {
    const s = setup()
    writeFiles(s.work, { 'src/engine.ts': 'my engine tweak\n' })
    git(s.work, 'commit', '-q', '-am', 'Tweak engine')
    s.publish({ ...s.base, 'src/engine.ts': 'engine v2\n' }, '2')
    const result = s.sync()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('the merge has conflicts')
  })

  it('reuses how an earlier snapshot conflict was resolved', () => {
    const s = setup()
    writeFiles(s.work, { 'src/engine.ts': 'my engine tweak\n' })
    git(s.work, 'commit', '-q', '-am', 'Tweak engine')
    git(s.work, 'push', '-q', 'origin', 'main')
    s.publish({ ...s.base, 'src/engine.ts': 'engine v2\n' }, '2')
    expect(s.sync().status).toBe(1)
    git(s.work, 'merge', '--abort')
    git(s.work, 'checkout', '-q', '-b', 'resolved')
    expect(spawnSync('git', ['merge', '-q', '--no-edit', 'upstream'], { cwd: s.work, env: { ...process.env, ...IDENTITY } }).status).toBe(1)
    writeFiles(s.work, { 'src/engine.ts': 'engine v2 with my tweak\n' })
    git(s.work, 'commit', '-q', '-am', 'Merge snapshot (2)')
    git(s.work, 'checkout', '-q', 'main')
    const trained = spawnSync('bash', [TRAINER, 'resolved', 'upstream'], { cwd: s.work, env: { ...process.env, ...IDENTITY }, encoding: 'utf8' })
    expect([trained.status, trained.stdout]).toEqual([0, expect.stringContaining('learned 1 resolution(s)')])
    const result = s.sync()
    expect([result.status, result.stdout]).toEqual([0, expect.stringContaining('reused earlier conflict resolutions')])
    expect(s.read('src/engine.ts')).toBe('engine v2 with my tweak\n')
  })
})

describe('workflows', () => {
  it('only call tools that are committed', () => {
    const tracked = new Set(execFileSync('git', ['ls-files', 'tools'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n'))
    const workflows = execFileSync('git', ['ls-files', '.github/workflows'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
    const called = workflows.flatMap((file) => [...readFileSync(join(ROOT, file), 'utf8').matchAll(/\btools\/[\w./-]+\.(?:sh|ts)\b/g)].map(([path]) => path))
    expect(called.length).toBeGreaterThan(0)
    expect(called.filter((path) => !tracked.has(path))).toEqual([])
  })
})
