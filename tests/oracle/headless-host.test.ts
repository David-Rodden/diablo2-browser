import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { isOracleToolchainAvailable113c } from '../../tools/oracle/fn-daemon.ts'

const REPO_ROOT = resolve(import.meta.dirname, '../..')
const RUN_HEADLESS = join(REPO_ROOT, 'tools/oracle/run-headless-oracle.sh')
const MELEE_SCENARIO = join(REPO_ROOT, 'tests/fixtures/oracle/scenarios/a1-bloodmoor-melee.json')
const MELEE_GOLDEN = join(REPO_ROOT, 'tests/fixtures/oracle/golden/a1-bloodmoor-melee.oracle.ndjson.gz')
const FALLEN_SCENARIO = join(REPO_ROOT, 'tests/fixtures/oracle/scenarios/a1c-bloodmoor-fallen.json')

const hasHeadlessEnv = isOracleToolchainAvailable113c() && existsSync(RUN_HEADLESS)

describe('Headless 1.13c Server Host (d2host-113c.exe, Plan §3.6.1)', () => {
  it.skipIf(!hasHeadlessEnv)(
    'reproduces all 1,800 frames of a1-bloodmoor-melee identically to the Game.exe golden trace without 25fps throttle',
    () => {
      const workDir = mkdtempSync(join(tmpdir(), 'd2host-melee-'))
      try {
        const outTrace = join(workDir, 'melee.ndjson')
        const stdout = execFileSync('bash', [RUN_HEADLESS, MELEE_SCENARIO, outTrace], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
        })
        expect(stdout).toContain('frames=1800')

        const goldenLines = gunzipSync(readFileSync(MELEE_GOLDEN))
          .toString('utf8')
          .split('\n')
          .filter((l) => l.trim().length > 0)
        const headlessLines = readFileSync(outTrace, 'utf8')
          .split('\n')
          .filter((l) => l.trim().length > 0)

        expect(headlessLines.length).toBe(goldenLines.length)
        expect(headlessLines.length).toBe(1801)

        for (let i = 1; i < goldenLines.length; i++) {
          const gObj = JSON.parse(goldenLines[i]!) as Record<string, unknown>
          const hObj = JSON.parse(headlessLines[i]!) as Record<string, unknown>
          if ('dot' in hObj && !('dot' in gObj)) {
            delete hObj.dot
          }
          expect(hObj).toEqual(gObj)
        }
      } finally {
        rmSync(workDir, { recursive: true, force: true })
      }
    },
    60_000,
  )

  it.skipIf(!hasHeadlessEnv)(
    'supports oracleFnRec, oracleOrderLog, and oracleMemDump hooks in headless mode',
    () => {
      const workDir = mkdtempSync(join(tmpdir(), 'd2host-hooks-'))
      try {
        const baseScenario = JSON.parse(readFileSync(FALLEN_SCENARIO, 'utf8')) as Record<string, unknown>
        const customScenario = {
          ...baseScenario,
          frames: 792,
          oracleFnRec: [['timers', 789, 791]],
          oracleOrderLog: [789, 791],
          oracleMemDump: [[790, 1, 9]],
        }
        const scnPath = join(workDir, 'hooks-scenario.json')
        const outTrace = join(workDir, 'hooks.ndjson')
        writeFileSync(scnPath, JSON.stringify(customScenario))

        execFileSync('bash', [RUN_HEADLESS, scnPath, outTrace], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          timeout: 60_000,
        })

        const lines = readFileSync(outTrace, 'utf8')
          .split('\n')
          .filter((l) => l.trim().length > 0)
        expect(lines.length).toBe(793)

        const f790 = JSON.parse(lines[790]!) as {
          frame: number
          ord?: unknown[]
          mem?: Array<{ type: number; id: number; blocks: unknown[] }>
        }
        expect(f790.frame).toBe(790)
        expect(Array.isArray(f790.ord)).toBe(true)
        expect(f790.ord!.length).toBeGreaterThan(0)
        expect(Array.isArray(f790.mem)).toBe(true)
        expect(f790.mem![0]?.blocks.length).toBeGreaterThan(0)

        const fnrecPath = join(`${outTrace}.d`, 'fnrec.ndjson')
        expect(existsSync(fnrecPath)).toBe(true)
        const fnrecLines = readFileSync(fnrecPath, 'utf8')
          .split('\n')
          .filter((l) => l.trim().length > 0)
        expect(fnrecLines.length).toBe(3)
      } finally {
        rmSync(workDir, { recursive: true, force: true })
      }
    },
    60_000,
  )
})
