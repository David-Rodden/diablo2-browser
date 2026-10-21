/**
 * Issue #1352 follow-up — OperateFn classification and shrine duration/reset.
 */
import { describe, expect, it } from 'vitest'
import { GameInstance } from '../../src/server/engine/game-instance.ts'
import { classifyObjectOperate113c } from '../../src/common/world/object-operate-113c.ts'

describe('issue #1352 object operate follow-up', () => {
  it('classifies Bank as stash and Armor Stand/Weapon Rack as containers', () => {
    expect(classifyObjectOperate113c(267)).toBe('stash')
    expect(classifyObjectOperate113c(252)).toBe("container")
  })

  it('applies shrine stats for 1200 frames and resets the shrine afterwards', () => {
    const game = new GameInstance({ seed: 1352, areaId: 1 })
    const playerId = game.connectPlayer({ charClass: 'pal', name: 'Hero', x: 10, y: 10, areaId: 1 })
    const shrineId = game.spawnObject({
      classId: 133, x: 11, y: 10, areaId: 1, isShrine: true, shrineType: 6,
    })
    game.enqueueCommand(playerId, { type: 'OperateObject', objectId: shrineId })
    game.stepFrames(1)
    const internal = game as unknown as {
      players: Map<number, unknown>
      objects: Map<number, { mode: number; shrineResetFrame: number }>
      playerCombatContext: (player: unknown) => {
        statList: { getModifierBonus: (stat: string) => number }
      }
    }
    const player = internal.players.get(playerId)!
    expect(internal.playerCombatContext(player).statList.getModifierBonus('item_armor_percent')).toBeGreaterThan(0)
    expect(internal.objects.get(shrineId)!.shrineResetFrame).toBeGreaterThan(game.frame)
    game.stepFrames(1202)
    expect(internal.objects.get(shrineId)!.mode).toBe(0)
  })
})