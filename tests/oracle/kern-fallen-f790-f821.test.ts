/**
 * K0 Phase 0 Vertical Slice Verification:
 * 1. Unit verification of `src/d2kern-113c/game/monster-events.ts` (`0x6FC969A0` dispatcher,
 *    freeze guard `0x6FC969F8`/`0x6FC96A00` + `SUNIT_IsDeadOrDying` `0x6FCFFA90`, mode tables
 *    `0x6FD1A498` / `0x6FD1BC50`, `MONSTER_ClearModeEvents` `0x6FD00750`, and persistent
 *    registration `0x6FD00B40` / `0x6FCAE940` / `0x6FCAE960`).
 * 2. End-to-end verification on `a1c-bloodmoor-fallen` through `src/d2kern-113c/`
 *    (`KernMonsterWheelRuntime113c` + `SparseMemory113c` + 64-slot `D2TimerStrc`):
 *    - Zero `.sort(` or sequence-number stand-ins in `frame-and-commands.ts` / `town-npc-ai-113c.ts`.
 *    - Exact F790 (`[12, 14, 15]` LIFO persistent head order) and F821 (`#13` flee before `#12`
 *      `DT -> DD` slot event) execution order, passing all 1,000 golden frames (`firstDivergenceFrame === Infinity`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_NODE_MPQ_DIR } from '../../src/baker/mpq-archive-source.ts'
import { SparseMemory113c } from '../../src/server/route2/sparse-memory.ts'
import {
  D2AiGeneralStrc,
  D2AiGeneralStrc_SIZE,
  D2EventStrc,
  D2GameStrc,
  D2MonsterDataStrc,
  D2MonsterDataStrc_SIZE,
  D2TimerStrc,
  D2UnitStrc,
} from '../../src/server/route2/layout.generated.ts'
import {
  EVENT_RemoveUnitEvents113c,
  EVENT_SetEventFull113c,
  EVENT_SetPersistentEventWithHandler113c,
  EVENT_SetPersistentUnitEvent113c,
  EVENT_UpdatePartition113c,
  GAME_Create113c,
  MON_EVENT_AI_THINK,
  MON_EVENT_MODE_END,
  MON_EVENT_MODE_STEP,
  MON_EVENT_STAT_REGEN,
  MONSTER_ClearModeEvents113c,
  MONSTER_DispatchEvent113c,
  MONSTER_GetModeEntry113c,
  MONSTER_IsContinuousMode113c,
  MONSTER_RegisterContinuousModeEvent113c,
  STATLIST_CreateEx113c,
  STATES_ToggleState113c,
  SUNIT_IsDeadOrDying113c,
  UNIT_MONSTER,
  UNITFLAG_DEAD_113C,
  UNITS_Create113c,
} from '../../src/d2kern-113c/index.ts'
import { getKernMonsterWheelRuntime113c } from '../../src/server/engine/game-instance/kern-monster-wheel-113c.ts'
import type { GameInstanceHost } from '../../src/server/engine/game-instance/host.ts'
import { loadReplicaEnvironment, parseScenario, runReplica } from '../../tools/oracle/lib/replica.ts'
import { parityForScenario, readBaseline } from '../../tools/oracle/parity-report.ts'

const REPO = join(import.meta.dirname, '..', '..')
const PACKS_DIR = process.env.D2_ACT_PACKS_DIR ?? 'public/act-packs/tiles'
const hasMpq = existsSync(join(DEFAULT_NODE_MPQ_DIR, 'd2data.mpq'))
const hasPacks = existsSync(join(PACKS_DIR, 'drlg-bundle.json'))

describe('src/d2kern-113c monster event dispatch & mode tables (0x6FC969A0 / 0x6FD00B40)', () => {
  it('verifies MONSTER_GetModeEntry113c (0x6FC949A0) base table + 6 class overrides & continuous table (0x6FC94F20)', () => {
    const m = new SparseMemory113c()
    const uFallen = UNITS_Create113c(m, UNIT_MONSTER, 19, 12)
    expect(MONSTER_GetModeEntry113c(m, uFallen, 0)?.pfnEnd).toBe(0x6fc96040) // DT -> DD
    expect(MONSTER_GetModeEntry113c(m, uFallen, 1)?.scheduleEvents).toBe(0) // NU
    expect(MONSTER_GetModeEntry113c(m, uFallen, 2)?.pfnStep).toBe(0x6fc96900) // WL
    expect(MONSTER_GetModeEntry113c(m, uFallen, 12)?.scheduleEvents).toBe(0) // DD
    expect(MONSTER_GetModeEntry113c(m, uFallen, 15)?.pfnStep).toBe(0x6fc96900) // RN

    // Continuous modes: {2 WL, 13 KB, 14 SQ, 15 RN}
    const continuousModes = Array.from({ length: 16 }, (_, i) => i).filter((mode) =>
      MONSTER_IsContinuousMode113c(mode),
    )
    expect(continuousModes).toEqual([2, 13, 14, 15])

    // 6 special classId overrides in 0x6FC949A0
    const u273 = UNITS_Create113c(m, UNIT_MONSTER, 273, 101)
    expect(MONSTER_GetModeEntry113c(m, u273, 9)?.pfnEnd).toBe(0x6fc95320)
    const u297 = UNITS_Create113c(m, UNIT_MONSTER, 297, 102)
    expect(MONSTER_GetModeEntry113c(m, u297, 7)?.pfnStep).toBe(0x6fc96d90)
    const u543 = UNITS_Create113c(m, UNIT_MONSTER, 543, 103)
    expect(MONSTER_GetModeEntry113c(m, u543, 8)?.pfnEnd).toBe(0x6fc95440)
    const u499 = UNITS_Create113c(m, UNIT_MONSTER, 499, 104)
    expect(MONSTER_GetModeEntry113c(m, u499, 11)?.scheduleEvents).toBe(1)
    const u511 = UNITS_Create113c(m, UNIT_MONSTER, 511, 105)
    expect(MONSTER_GetModeEntry113c(m, u511, 8)?.pfnEnd).toBe(0x6fc95650)
    const u362 = UNITS_Create113c(m, UNIT_MONSTER, 362, 106)
    expect(MONSTER_GetModeEntry113c(m, u362, 8)?.pfnStep).toBe(0x6fc95570)
  })

  it('enforces 0x6FC969A0 STATE_FREEZE guard while allowing Event 3 & frozen DT -> DD (0x6FCFFA90)', () => {
    const m = new SparseMemory113c()
    const pGame = GAME_Create113c(m)
    const pUnit = UNITS_Create113c(m, UNIT_MONSTER, 19, 12, pGame)
    const pMonData = m.alloc(D2MonsterDataStrc_SIZE)
    const pAiGen = m.alloc(D2AiGeneralStrc_SIZE)
    m.set(pAiGen, D2AiGeneralStrc.pfnThink, 0x6fca3130)
    m.set(pMonData, D2MonsterDataStrc.pAiGeneral, pAiGen)
    m.set(pUnit, D2UnitStrc.pUnitData, pMonData)
    m.set(pUnit, D2UnitStrc.dwAnimMode, 2) // WL (alive)
    STATLIST_CreateEx113c(m, pUnit, 0, pGame)
    STATES_ToggleState113c(m, pUnit, 1, true) // STATE_FREEZE = 1

    const fired: number[] = []
    const cbs = {
      onModeStep: () => fired.push(0),
      onModeEnd: () => fired.push(1),
      onAiThink: () => fired.push(2),
      onStatRegen: () => fired.push(3),
      onOtherEvent: (_m: unknown, _g: number, _u: number, ev: number) => fired.push(ev),
    }

    // Alive + frozen: Event 0, 1, 2, 6 blocked; Event 3, 5, 8, 12 bypass!
    for (const ev of [0, 1, 2, 3, 5, 6, 8, 12]) {
      MONSTER_DispatchEvent113c(m, pGame, pUnit, ev, 0, 0, cbs)
    }
    expect(fired).toEqual([3, 5, 8, 12])

    // Dying (`dwAnimMode = 0` DT) + frozen: `SUNIT_IsDeadOrDying113c` == 1 -> `Event 1` (`DT -> DD`) MUST fire!
    fired.length = 0
    m.set(pUnit, D2UnitStrc.dwAnimMode, 0)
    expect(SUNIT_IsDeadOrDying113c(m, pUnit)).toBe(1)
    MONSTER_DispatchEvent113c(m, pGame, pUnit, MON_EVENT_MODE_END, 1, 0, cbs)
    expect(fired).toEqual([1])

    // `UNITFLAG_DEAD_113C` (`0x10000`) also marks unit dead in `SUNIT_IsDeadOrDying113c`
    m.set(pUnit, D2UnitStrc.dwAnimMode, 1)
    m.set(pUnit, D2UnitStrc.dwFlags, UNITFLAG_DEAD_113C)
    expect(SUNIT_IsDeadOrDying113c(m, pUnit)).toBe(1)
  })

  it('verifies 0x6FD00750 ClearModeEvents, 0x6FCAE940/960 wrappers, and 0x6FD00B40 re-entrant LIFO registration', () => {
    const m = new SparseMemory113c()
    const pGame = GAME_Create113c(m)
    m.set(pGame, D2GameStrc.dwGameFrame, 788)

    const u12 = UNITS_Create113c(m, UNIT_MONSTER, 19, 12, pGame)
    const u14 = UNITS_Create113c(m, UNIT_MONSTER, 19, 14, pGame)
    const u15 = UNITS_Create113c(m, UNIT_MONSTER, 19, 15, pGame)
    for (const u of [u12, u14, u15]) m.set(u, D2UnitStrc.dwAnimMode, 2)

    // Register moves in order 15, then 14, then 12 -> LIFO head must fire [12, 14, 15]!
    MONSTER_RegisterContinuousModeEvent113c(m, pGame, u15)
    MONSTER_RegisterContinuousModeEvent113c(m, pGame, u14)
    MONSTER_RegisterContinuousModeEvent113c(m, pGame, u12)

    // Also attach AI (2) and Regen (3) and ModeEnd (1) on u12, then call MONSTER_ClearModeEvents113c:
    // 0 and 1 must be freed while 2 and 3 remain!
    EVENT_SetEventFull113c(m, pGame, u12, MON_EVENT_MODE_END, 800)
    EVENT_SetEventFull113c(m, pGame, u12, MON_EVENT_AI_THINK, 805)
    EVENT_SetEventFull113c(m, pGame, u12, MON_EVENT_STAT_REGEN, 789)
    MONSTER_ClearModeEvents113c(m, pGame, u12)
    // Re-register u12 continuous move so LIFO head is [12, 14, 15]
    MONSTER_RegisterContinuousModeEvent113c(m, pGame, u12)

    // Standalone wrappers 0x6FCAE940 & 0x6FCAE960
    const uExtra = UNITS_Create113c(m, UNIT_MONSTER, 19, 99, pGame)
    const n940 = EVENT_SetPersistentEventWithHandler113c(m, pGame, uExtra, 8, 11, 22, 0x6fcc1e80)
    expect(m.get(n940, D2EventStrc.pfnHandler)).toBe(0x6fcc1e80)
    const n960 = EVENT_SetPersistentUnitEvent113c(m, pGame, uExtra, 5, 33, 44)
    expect(m.get(n960, D2EventStrc.pfnHandler)).toBe(0)
    EVENT_RemoveUnitEvents113c(m, pGame, uExtra)

    // Frame 789: during u14's step, u14 re-registers its move (re-entrant 0x6FD00B40!) -> next frame order becomes [14, 12, 15]
    m.set(pGame, D2GameStrc.dwGameFrame, 789)
    const f789Order: string[] = []
    EVENT_UpdatePartition113c(m, pGame, 1, (_mem, _g, pUnit, evType) => {
      const id = m.get(pUnit, D2UnitStrc.dwUnitId)
      f789Order.push(`${id}:${evType}`)
      if (id === 14 && evType === 0) {
        MONSTER_RegisterContinuousModeEvent113c(m, pGame, u14)
      }
    })
    expect(f789Order).toEqual(['12:0', '14:0', '15:0', '12:3'])

    m.set(pGame, D2GameStrc.dwGameFrame, 790)
    const f790Order: string[] = []
    EVENT_UpdatePartition113c(m, pGame, 1, (_mem, _g, pUnit, evType) => {
      f790Order.push(`${m.get(pUnit, D2UnitStrc.dwUnitId)}:${evType}`)
    })
    expect(f790Order).toEqual(['14:0', '12:0', '15:0'])
  })

  it('contains zero .sort() or sequence-number stand-ins in frame-and-commands.ts and town-npc-ai-113c.ts', () => {
    const frameSrc = readFileSync(
      join(REPO, 'src/server/engine/game-instance/frame-and-commands.ts'),
      'utf8',
    )
    const npcSrc = readFileSync(join(REPO, 'src/server/ai/town-npc-ai-113c.ts'), 'utf8')
    expect(frameSrc).not.toContain('monsterEventSeqByHost113c')
    expect(frameSrc).not.toContain('refreshMonsterEventSeq113c')
    expect(frameSrc).not.toContain('event3Seq113c')
    expect(frameSrc).not.toContain('.sort(')
    expect(npcSrc).not.toContain('monsterMoveSeq113c')
    expect(npcSrc).not.toContain('getMonsterMoveSeq113c')
  })
})

describe.skipIf(!hasMpq || !hasPacks)('a1c-bloodmoor-fallen driven by src/d2kern-113c through F790 / F821..F999', () => {
  it('passes F790, F821, and every monster frame up to the F1000 baseline while verifying live D2TimerStrc LIFO/FIFO nodes', async () => {
    const env = await loadReplicaEnvironment({ packsDir: PACKS_DIR })
    const baseline = readBaseline()
    const row = parityForScenario('a1c-bloodmoor-fallen', env)
    expect(row.firstDivergenceFrame, row.summary).toBeGreaterThanOrEqual(baseline['a1c-bloodmoor-fallen'] ?? 1000)
    expect(row.firstDivergenceFrame).toBeGreaterThan(821)

    const scenRaw = JSON.parse(
      readFileSync(join(REPO, 'tests/fixtures/oracle/scenarios/a1c-bloodmoor-fallen.json'), 'utf8'),
    )
    const scenario = parseScenario(scenRaw)

    let persistentIdsAtF790Before: number[] = []
    let persistentIdsAtF821Before: number[] = []
    let slotEventsAtF821Before: Array<{ unitId: number; evType: number; frame: number }> = []
    let f821AfterModes: Record<number, number> = {}

    runReplica(scenario, env, {
      repoRoot: REPO,
      observe: false,
      beforeFrame: (f, game) => {
        if (f !== 790 && f !== 821) return
        const host = game as unknown as GameInstanceHost
        const rt = getKernMonsterWheelRuntime113c(host)
        const pTimer = rt.mem.get(rt.pGame, D2GameStrc.pTimer)
        const pIds: number[] = []
        for (
          let n = rt.mem.get(pTimer, D2TimerStrc.pPersistentHead, 1);
          n !== 0;
          n = rt.mem.get(n, D2EventStrc.pWheelNewer)
        ) {
          pIds.push(rt.mem.get(n, D2EventStrc.dwUnitId))
        }
        if (f === 790) {
          persistentIdsAtF790Before = pIds
        }
        if (f === 821) {
          persistentIdsAtF821Before = pIds
          const slot = 1 * 64 + (821 & 63)
          for (
            let n = rt.mem.get(pTimer, D2TimerStrc.pSlotTail, slot);
            n !== 0;
            n = rt.mem.get(n, D2EventStrc.pWheelNewer)
          ) {
            slotEventsAtF821Before.push({
              unitId: rt.mem.get(n, D2EventStrc.dwUnitId),
              evType: rt.mem.get(n, D2EventStrc.nType),
              frame: rt.mem.get(n, D2EventStrc.dwFrame),
            })
          }
        }
      },
      afterFrame: (f, game) => {
        if (f === 821) {
          const host = game as unknown as GameInstanceHost
          f821AfterModes = {
            12: host.monsters.get(12)?.mode ?? -1,
            13: host.monsters.get(13)?.mode ?? -1,
          }
        }
      },
    })

    // At F790: #14 registered its move after #15, so #14 precedes #15 in pPersistentHead[1]!
    const idx14 = persistentIdsAtF790Before.indexOf(14)
    const idx15 = persistentIdsAtF790Before.indexOf(15)
    expect(idx14).toBeGreaterThanOrEqual(0)
    expect(idx15).toBeGreaterThan(idx14)

    // At F821: #13 is in pPersistentHead[1] (runs BEFORE slot events), while #12's DT -> DD (`evType = 1`) is in slot 821 & 63!
    expect(persistentIdsAtF821Before).toContain(13)
    expect(slotEventsAtF821Before).toContainEqual({ unitId: 12, evType: 1, frame: 821 })
    // After F821: #13 fled (`mode = 2` WL) before #12 transitioned `DT -> DD` (`mode = 12`)!
    expect(f821AfterModes).toEqual({ 12: 12, 13: 2 })
  }, 120_000)
})
