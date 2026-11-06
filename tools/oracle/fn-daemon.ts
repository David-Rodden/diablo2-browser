/**
 * Persistent warm `fnharness v2` Wine daemon & worker pool (`Plan §3.3`).
 *
 * Boots `Game.exe` + `fnharness.dll` once into an active single-player game (`player` + `monster`
 * live in memory), enters `run_daemon_loop()` (`C:\oracle\daemon.mode`), and serves subsequent
 * NDJSON batches over atomic host-filesystem spool files (`req.tmp` -> `req.ndjson` -> `resp.ndjson`)
 * in `< 5ms` per batch (eliminating the ~20s Xvfb + Wine + menu startup cost per test suite).
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')

export const SNAP_PTR_GAME = 0xdead0001
export const SNAP_PTR_PLAYER = 0xdead0002
export const SNAP_PTR_MONSTER = 0xdead0003
export const SNAP_PTR_BUF = 0xdead0004

export interface DaemonReadyInfo113c {
  readonly pid: number
  readonly game: number
  readonly player: number
  readonly monster: number
}

export interface SnapCallRequest113c {
  /** `0` = `D2Game.dll` (base `0x6FC20000`), `1` = `D2Common.dll` (base `0x6FD50000`). */
  readonly mod: 0 | 1
  /** Preferred-base virtual address (e.g., `0x6FD8A740`). */
  readonly va: number
  readonly eax?: number
  readonly ecx?: number
  readonly edx?: number
  readonly ebx?: number
  readonly esi?: number
  readonly edi?: number
  readonly args?: readonly number[]
  readonly frame?: number
  readonly diff?: number
  readonly pClass?: number
  /** When `1`, temporarily clears `D2StatListExStrc.fpStatChanged` (`+0x5C`) to test pure `D2Common` stat evaluation without `D2Game` player vital/level-up callbacks. */
  readonly noStatCb?: 0 | 1
  readonly gameSeed?: readonly [number, number]
  readonly pSeed?: readonly [number, number]
  /** Flat `[statId, value, ...]` pairs applied to `g_player` before the call. */
  readonly pStats?: readonly number[]
  /** Flat `[statId, value, ...]` pairs applied to `g_monster` before the call. */
  readonly mStats?: readonly number[]
  /** Flat `[stateId, bSet, ...]` pairs toggled on `g_player` before the call. */
  readonly pStates?: readonly number[]
  /** Optional `uint32` words staged into `g_snap_buf` (`SNAP_PTR_BUF`). */
  readonly buf?: readonly number[]
  /** Player stat IDs whose `[statId, baseVal, fullVal]` are returned after the call. */
  readonly qStats?: readonly number[]
  /** Player state IDs whose `[stateId, activeMask, dirtyMask]` are returned after the call. */
  readonly qStates?: readonly number[]
}

export interface SnapCallResponse113c {
  readonly fault: number
  readonly eax: number
  readonly gameSeed: readonly [number, number]
  readonly pSeed: readonly [number, number]
  readonly qStats: readonly (readonly [number, number, number])[]
  readonly qStates: readonly (readonly [number, number, number])[]
  readonly s2c: readonly { readonly q: number; readonly cid: number; readonly hex: string }[]
}

export interface FnDaemonOptions113c {
  readonly oracleRoot?: string
  readonly workerId?: number
  readonly savePath?: string
  readonly maxLifetimeSeconds?: number
  readonly bootTimeoutMs?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function defaultOracleRoot113c(): string {
  return process.env['D2_ORACLE_ROOT'] ?? join(homedir(), '.local', 'opt', 'd2oracle')
}

export function isOracleToolchainAvailable113c(root = defaultOracleRoot113c()): boolean {
  return (
    existsSync(join(root, 'wine', 'root', 'usr', 'lib', 'x86_64-linux-gnu', 'wine', 'wine')) &&
    existsSync(join(root, 'wine', 'prefix', 'drive_c', 'D2', 'Game.exe'))
  )
}

export class FnOracleDaemon {
  private readonly root: string
  private readonly prefixDir: string
  private readonly oracleDir: string
  private readonly spoolDir: string
  private readonly outDir: string
  private readonly runOutDir: string
  private readonly savePath: string
  private readonly maxLifetimeSeconds: number
  private readonly bootTimeoutMs: number
  private proc: ChildProcess | null = null
  private readyInfo: DaemonReadyInfo113c | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private closed = false

  constructor(opts: FnDaemonOptions113c = {}) {
    this.root = opts.oracleRoot ?? defaultOracleRoot113c()
    const workerId = opts.workerId ?? 0
    this.prefixDir = join(this.root, 'wine', `prefix-daemon-${workerId}`)
    this.oracleDir = join(this.prefixDir, 'drive_c', 'oracle')
    this.spoolDir = join(this.oracleDir, 'spool')
    this.outDir = join(this.oracleDir, 'out')
    const cacheBase = join(homedir(), '.cache', 'd2oracle-runs')
    mkdirSync(cacheBase, { recursive: true })
    this.runOutDir = mkdtempSync(join(cacheBase, `daemon-${workerId}-`))
    this.savePath = opts.savePath ?? join(REPO, 'tests/fixtures/oracle/saves/a1-barbarian-l1.d2s')
    this.maxLifetimeSeconds = opts.maxLifetimeSeconds ?? 900
    this.bootTimeoutMs = opts.bootTimeoutMs ?? 90_000
  }

  get info(): DaemonReadyInfo113c | null {
    return this.readyInfo
  }

  private ensurePrefix(): void {
    if (!existsSync(join(this.prefixDir, 'drive_c', 'D2', 'Game.exe'))) {
      const basePrefix = join(this.root, 'wine', 'prefix')
      if (!existsSync(basePrefix)) {
        throw new Error(`Missing Wine template prefix at ${basePrefix}`)
      }
      execFileSync('cp', ['-a', basePrefix, this.prefixDir])
    }
    // Kill any leftover wineserver on this worker prefix before starting fresh.
    const wineserver = join(this.root, 'wine', 'root', 'usr', 'lib', 'x86_64-linux-gnu', 'wine', 'wineserver')
    if (existsSync(wineserver)) {
      try {
        execFileSync(wineserver, ['-k'], {
          env: { ...process.env, WINEPREFIX: this.prefixDir },
          stdio: 'ignore',
        })
      } catch {
        // Already stopped
      }
    }
  }

  async start(): Promise<DaemonReadyInfo113c> {
    if (this.readyInfo) return this.readyInfo
    this.ensurePrefix()
    rmSync(this.spoolDir, { recursive: true, force: true })
    rmSync(this.outDir, { recursive: true, force: true })
    mkdirSync(this.spoolDir, { recursive: true })
    mkdirSync(this.outDir, { recursive: true })
    writeFileSync(join(this.oracleDir, 'daemon.mode'), '1\n')

    const runOracleSh = join(HERE, 'run-oracle.sh')
    const menuTxt = join(HERE, 'menus', 'sp-first-char.txt')
    this.proc = spawn(
      'bash',
      [runOracleSh, menuTxt, this.runOutDir, String(this.maxLifetimeSeconds), '-w', '-ns'],
      {
        cwd: REPO,
        env: {
          ...process.env,
          D2_ORACLE_ROOT: this.root,
          ORACLE_PREFIX: this.prefixDir,
          ORACLE_DLL: 'fnharness.dll',
          ORACLE_SAVE: this.savePath,
          ORACLE_SHOT_EVERY: '1',
        },
        stdio: 'ignore',
      },
    )

    const readyPath = join(this.outDir, 'daemon.ready')
    const deadline = performance.now() + this.bootTimeoutMs
    while (performance.now() < deadline) {
      if (existsSync(readyPath)) {
        const raw = readFileSync(readyPath, 'utf8').trim()
        if (raw.endsWith('}')) {
          this.readyInfo = JSON.parse(raw) as DaemonReadyInfo113c
          return this.readyInfo
        }
      }
      if (this.proc.exitCode !== null) {
        const logPath = join(this.outDir, 'log.txt')
        const logTail = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '(no log)'
        throw new Error(`fnharness daemon exited early (code ${this.proc.exitCode}): ${logTail}`)
      }
      await sleep(15)
    }
    await this.close()
    throw new Error(`Timed out waiting ${this.bootTimeoutMs}ms for fnharness daemon.ready`)
  }

  /** Execute raw NDJSON request lines on the warm daemon and return raw response lines + elapsed ms. */
  execLines(lines: readonly string[], timeoutMs = 30_000): Promise<{ lines: string[]; elapsedMs: number }> {
    const run = async (): Promise<{ lines: string[]; elapsedMs: number }> => {
      if (this.closed) throw new Error('FnOracleDaemon is closed')
      if (!this.readyInfo) await this.start()

      const reqTmp = join(this.spoolDir, 'req.tmp')
      const reqFinal = join(this.spoolDir, 'req.ndjson')
      const respFinal = join(this.spoolDir, 'resp.ndjson')
      if (existsSync(respFinal)) unlinkSync(respFinal)

      const payload = lines.join('\n') + '\n'
      const t0 = performance.now()
      writeFileSync(reqTmp, payload)
      renameSync(reqTmp, reqFinal)

      const deadline = t0 + timeoutMs
      while (performance.now() < deadline) {
        if (existsSync(respFinal)) {
          const text = readFileSync(respFinal, 'utf8')
          unlinkSync(respFinal)
          const elapsedMs = performance.now() - t0
          const outLines = text.split('\n').filter((l) => l.trim().length > 0)
          return { lines: outLines, elapsedMs }
        }
        await sleep(1)
      }
      throw new Error(`FnOracleDaemon batch timed out after ${timeoutMs}ms (${lines.length} lines)`)
    }
    const next = this.queue.then(run, run)
    this.queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  /** Execute legacy/extended integer-array ops (`[op, a0, ...]`) on the warm daemon. */
  async execArrayOps(
    ops: readonly (readonly number[])[],
    timeoutMs = 30_000,
  ): Promise<{ results: (number | string)[][]; elapsedMs: number }> {
    const reqLines = ops.map((row) => JSON.stringify(row))
    const { lines, elapsedMs } = await this.execLines(reqLines, timeoutMs)
    if (lines.length !== ops.length) {
      throw new Error(`FnOracleDaemon response count mismatch: got ${lines.length}, expected ${ops.length}`)
    }
    return {
      results: lines.map((l) => JSON.parse(l) as (number | string)[]),
      elapsedMs,
    }
  }

  /** Execute stateful `SNAP_CALL` (`op 200`) requests in a single warm batch. */
  async execSnapBatch(
    requests: readonly SnapCallRequest113c[],
    timeoutMs = 30_000,
  ): Promise<{ responses: SnapCallResponse113c[]; elapsedMs: number }> {
    const reqLines = requests.map((r) => JSON.stringify({ op: 200, ...r }))
    const { lines, elapsedMs } = await this.execLines(reqLines, timeoutMs)
    if (lines.length !== requests.length) {
      throw new Error(`FnOracleDaemon snap count mismatch: got ${lines.length}, expected ${requests.length}`)
    }
    return {
      responses: lines.map((l) => JSON.parse(l) as SnapCallResponse113c),
      elapsedMs,
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      if (existsSync(this.spoolDir)) {
        writeFileSync(join(this.spoolDir, 'shutdown'), '1\n')
      }
      const donePath = join(this.outDir, 'done')
      const deadline = performance.now() + 4000
      while (performance.now() < deadline) {
        if (existsSync(donePath) || (this.proc && this.proc.exitCode !== null)) break
        await sleep(20)
      }
    } finally {
      const daemonFlag = join(this.oracleDir, 'daemon.mode')
      if (existsSync(daemonFlag)) {
        try {
          unlinkSync(daemonFlag)
        } catch {
          // ignore
        }
      }
      const wineserver = join(
        this.root,
        'wine',
        'root',
        'usr',
        'lib',
        'x86_64-linux-gnu',
        'wine',
        'wineserver',
      )
      if (existsSync(wineserver)) {
        try {
          execFileSync(wineserver, ['-k'], {
            env: { ...process.env, WINEPREFIX: this.prefixDir },
            stdio: 'ignore',
          })
        } catch {
          // ignore
        }
      }
      if (this.proc && this.proc.exitCode === null) {
        this.proc.kill('SIGTERM')
      }
      rmSync(this.runOutDir, { recursive: true, force: true })
    }
  }
}

export class FnOraclePool {
  private readonly workers: FnOracleDaemon[]
  private rr = 0

  constructor(size = 1, opts: Omit<FnDaemonOptions113c, 'workerId'> = {}) {
    this.workers = Array.from({ length: Math.max(1, size) }, (_, i) => new FnOracleDaemon({ ...opts, workerId: i }))
  }

  async startAll(): Promise<DaemonReadyInfo113c[]> {
    return Promise.all(this.workers.map((w) => w.start()))
  }

  nextWorker(): FnOracleDaemon {
    const w = this.workers[this.rr % this.workers.length]!
    this.rr = (this.rr + 1) >>> 0
    return w
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()))
  }
}
