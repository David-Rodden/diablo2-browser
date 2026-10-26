import { describe, expect, it } from 'vitest'
import { readyRecipe, runeRecipe, transmute, type CubeHost } from '../../src/client/guide/cube-recipes.ts'
import { freeSpots } from '../../src/client/input/auto-loot.ts'
import type { ClientWorld } from '../../src/client/world/client-world.ts'

const holding = (inventory: string[], cube: string[] = [], stash: string[] = [], worn: string[] = []) => {
  const map = (codes: string[], offset: number) => new Map(codes.map((code, i) => [offset + i, { id: offset + i, code, invWidth: 1, invHeight: 1, gridX: i, gridY: 0, bodyLoc: 2 }]))
  return { containers: { inventory: map(inventory, 1), cube: map(cube, 100), stash: map(stash, 200), equipment: map(worn, 300), cursor: null } } as unknown as ClientWorld
}

describe('Horadric Cube quest recipes', () => {
  it('is ready once the cube, staff and amulet are all carried, wherever they sit', () => {
    expect(readyRecipe(holding(['box', 'msf ', 'vip']))?.name).toBe('Horadric Staff')
    expect(readyRecipe(holding(['box', 'msf'], ['vip']))?.name).toBe('Horadric Staff')
    expect(readyRecipe(holding(['msf', 'vip']))).toBeNull()
    expect(readyRecipe(holding(['box', 'msf', 'vip', 'hst']))).toBeNull()
    expect(readyRecipe(holding(['msf'], [], ['box', 'vip']))?.inStash).toEqual(['box', 'vip'])
    expect(readyRecipe(holding(['box', 'msf'], [], [], ['vip']))).toMatchObject({ name: 'Horadric Staff', inStash: [] })
  })

  it('takes a worn amulet off before putting it in the cube', async () => {
    const world = holding(['box', 'msf'], [], [], ['vip']) as unknown as { containers: Record<string, Map<number, { id: number; code: string }>> & { cursor: { id: number; code: string } | null } }
    const { inventory, cube, equipment } = world.containers
    const hudManager = { leftPanel: 'none' }
    const take = (id: number) => [inventory, cube, equipment].find((box) => box.has(id))!
    const hudModel = {
      unequipItem: () => {
        world.containers.cursor = equipment.get(300)!
        equipment.delete(300)
      },
      useItem: () => void (hudManager.leftPanel = 'cube'),
      pickupItemToCursor: (id: number) => {
        const from = take(id)
        world.containers.cursor = from.get(id)!
        from.delete(id)
      },
      placeCursorItem: (id: number, x: number, y: number, buffer: number) => {
        ;(buffer === 3 ? cube : inventory).set(id, { ...world.containers.cursor!, gridX: x, gridY: y } as never)
        world.containers.cursor = null
      },
      transmuteCube: () => {
        cube.clear()
        cube.set(400, { id: 400, code: 'hst', invWidth: 1, invHeight: 4, gridX: 0, gridY: 0 } as never)
      },
      closeCube: () => void (hudManager.leftPanel = 'none'),
    }
    const host = { world, hudManager, hudModel } as unknown as CubeHost
    expect(await transmute(host, readyRecipe(host.world)!.recipe)).toBe(true)
    expect([...inventory.values()].map((item) => item.code).sort()).toEqual(['box', 'hst'])
  })

  it('finds room in the 3 by 4 cube grid', () => {
    expect(freeSpots([{ id: 1, gridX: 0, gridY: 0, invWidth: 1, invHeight: 4 }], 2, 4, 3, 4)).toEqual([{ x: 1, y: 0 }])
  })
})

describe('Horadric Cube rune upgrades', () => {
  it('fetches only the missing runes from the stash', () => {
    const recipe = runeRecipe(holding(['box', 'r04'], [], ['r04', 'r04', 'r04']), { rune: 'r04', makes: 'r05', count: 3 })
    expect(recipe).toEqual({ name: '3 Nef into Eth', recipe: { inputs: ['r04', 'r04', 'r04'], makes: 'r05' }, inStash: ['r04', 'r04'] })
    expect(runeRecipe(holding(['r04', 'r04', 'r04']), { rune: 'r04', makes: 'r05', count: 3 })).toBeNull()
    expect(runeRecipe(holding([], [], ['box', 'r04', 'r04', 'r04']), { rune: 'r04', makes: 'r05', count: 3 })?.inStash).toEqual(['box', 'r04', 'r04', 'r04'])
  })
})
