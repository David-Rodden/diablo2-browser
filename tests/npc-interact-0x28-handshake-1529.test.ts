import { describe, expect, it } from 'vitest'
import { OnlineSession } from '../src/client/session/online-session.ts'
import type { ClientCommand } from '../src/netproto/index.ts'

describe('1.13c S2C 0x28 UpdateQuestInfo -> C2S 0x2F NpcInit / 0x30 NpcCancel Handshake (#1529)', () => {
  it('sends C2S 0x2F NpcInit and opens NPC interaction when S2C 0x28 unit exists in client table (0x6fafb955..0x6fafb9b7)', () => {
    const session = new OnlineSession()
    const sent: ClientCommand[] = []
    ;(session as any).gameAdapter = {
      state: 'open',
      send: (cmd: ClientCommand) => {
        sent.push(cmd)
      },
    }
    session.world.selfId = 1
    session.handleServerEvent({
      type: 'UnitAssign',
      unit: { unitType: 'player', id: 1, classId: 1, name: 'Hero', x: 100, y: 100, mode: 1, lifePct: 100 },
      isSelf: true,
    })
    session.handleServerEvent({
      type: 'UnitAssign',
      unit: { unitType: 'monster', id: 42, classId: 154, x: 102, y: 102, mode: 1, lifePct: 128 },
    })

    const quests = new Uint16Array(48)
    quests[3] = 0x0002
    session.handleServerEvent({
      type: 'QuestState',
      kind: 'update',
      source: 0x28,
      updateType: 1,
      unitId: 42,
      quests,
    })

    expect(session.world.npcInteraction.npcId).toBe(42)
    expect(session.world.quests[3]).toBe(0x0002)
    expect(sent).toContainEqual({
      type: 'NpcInit',
      target: { unitType: 1, id: 42 },
    })
  })

  it('sends C2S 0x30 NpcCancel and clears NPC interaction when S2C 0x28 unit is missing from client table (0x6fafb923..0x6fafb93f)', () => {
    const session = new OnlineSession()
    const sent: ClientCommand[] = []
    ;(session as any).gameAdapter = {
      state: 'open',
      send: (cmd: ClientCommand) => {
        sent.push(cmd)
      },
    }
    session.world.selfId = 1
    session.handleServerEvent({
      type: 'UnitAssign',
      unit: { unitType: 'player', id: 1, classId: 1, name: 'Hero', x: 100, y: 100, mode: 1, lifePct: 100 },
      isSelf: true,
    })
    // Pre-populate an active interaction that should be cancelled when 0x28 target unit (99) is missing
    session.world.applyEvent({
      type: 'UnitAssign',
      unit: { unitType: 'monster', id: 42, classId: 154, x: 102, y: 102, mode: 1, lifePct: 128 },
    })
    session.world.noteOutgoingCommand({ type: 'NpcInit', target: { unitType: 1, id: 42 } })
    expect(session.world.npcInteraction.npcId).toBe(42)

    const quests = new Uint16Array(48).fill(0x1111)
    session.handleServerEvent({
      type: 'QuestState',
      kind: 'update',
      source: 0x28,
      updateType: 1,
      unitId: 99,
      quests,
    })

    expect(session.world.npcInteraction.npcId).toBeNull()
    expect(sent).toContainEqual({
      type: 'NpcCancel',
      target: { unitType: 1, id: 99 },
      npcId: 99,
    })
  })
})
