/**
 * Issue #1341 — MonAi-driven dispatch, not display-name heuristics.
 */
import { describe, expect, it } from 'vitest'
import { GameInstance } from '../../src/server/engine/game-instance.ts'
import { MONSTER_AI_BEHAVIOR_BY_AI } from '../../src/server/engine/game-instance.ts'
import { MONAI_113C_ROWS } from '../../src/common/units/monstats-113c-data.ts'

function normalize(ai: string): string {
  return ai.trim().toLowerCase().replace(/[\s_-]/g, '')
}

describe('issue #1341 MonAi dispatch', () => {
  it('assigns every MonAi.txt row to an explicit behavior family', () => {
    expect(MONAI_113C_ROWS).toHaveLength(148)
    for (const row of MONAI_113C_ROWS) {
      expect(
        MONSTER_AI_BEHAVIOR_BY_AI[normalize(row.ai)],
        `MonAi row ${String(row.index)} (${row.ai}) has no behavior`,
      ).toBeDefined()
    }
    expect(Object.keys(MONSTER_AI_BEHAVIOR_BY_AI)).toHaveLength(148)
  })

  it('does not classify hcIdx 5 (zombie1) as ranged, and keeps a real archer ranged', () => {
    const game = new GameInstance({ seed: 1341, areaId: 2 })
    game.connectPlayer({ charClass: 'bar', name: 'Target', x: 10, y: 10, areaId: 2 })
    const zombie = game.spawnMonster({ hcIdx: 5, defId: 'zombie1', x: 12, y: 10, areaId: 2 })
    const archer = game.spawnMonster({ hcIdx: 160, defId: 'cr_archer1', x: 16, y: 10, areaId: 2 })
    expect(game.getMonster(zombie)!.isRanged).toBe(false)
    expect(game.getMonster(archer)!.isRanged).toBe(true)
  })

  it('detonates a SuicideMinion on contact', () => {
    const game = new GameInstance({ seed: 1347, areaId: 2 })
    const playerId = game.connectPlayer({ charClass: 'bar', name: 'Target', x: 10, y: 10, areaId: 2, hp: 500, maxHp: 500 })
    const minion = game.spawnMonster({ hcIdx: 461, defId: 'suicideminion1', x: 11, y: 10, areaId: 2, hp: 20, maxHp: 20 })
    game.stepFrames(2)
    expect(game.getMonsterState(minion)!.dead).toBe(true)
    expect(game.getPlayerState(playerId)!.hp).toBeLessThan(500)
  })

  it('spawns VileDog children from a VileMother', () => {
    const game = new GameInstance({ seed: 1348, areaId: 1 })
    game.connectPlayer({ charClass: 'bar', name: 'Target', x: 10, y: 10, areaId: 1 })
    const mother = game.spawnMonster({ defId: 'vilemother1', x: 15, y: 10, areaId: 1, hp: 500, maxHp: 500 })
    const before = (game as unknown as { monsters: Map<number, unknown> }).monsters.size
    game.stepFrames(140)
    const monsters = (game as unknown as { monsters: Map<number, { defId: string }> }).monsters
    expect(monsters.size).toBeGreaterThan(before)
    expect([...monsters.values()].some((m) => m.defId === 'viledog1')).toBe(true)
    expect(game.getMonster(mother)).toBeDefined()
  })

  it('keeps stationary AI rows (MaggotEgg) at their spawn anchor', () => {
    const game = new GameInstance({ seed: 1342, areaId: 2 })
    game.connectPlayer({ charClass: 'bar', name: 'Target', x: 15, y: 10, areaId: 2 })
    const egg = game.spawnMonster({ hcIdx: 190, defId: 'maggotegg1', x: 10, y: 10, areaId: 2 })
    game.stepFrames(40)
    const state = game.getMonster(egg)!
    expect(state.x).toBe(10)
    expect(state.y).toBe(10)
  })
})