import type { BnetFlowState } from '../frontend/flow-state.ts'
import { waitFor } from '../ui-model/stash-deposit.ts'

export interface FreshGameHost {
  readonly phase: () => string
  readonly difficulty: () => 0 | 1 | 2
  readonly inWorld: () => boolean
  readonly leave: () => Promise<void>
  readonly flow: BnetFlowState
  readonly create: ((state: BnetFlowState) => Promise<void> | void) | undefined
}

const DIFFICULTIES = ['normal', 'nightmare', 'hell'] as const
const LOBBY_MS = 30_000
const ENTER_MS = 120_000

export async function freshGame(host: FreshGameHost): Promise<boolean> {
  const { flow, create } = host
  if (create === undefined || flow.playMode === 'single') return false
  const difficulty = DIFFICULTIES[host.difficulty()]
  const name = (flow.roster[flow.selectedSlotIndex]?.name ?? 'pilot').slice(0, 6).toLowerCase()
  await host.leave()
  if (!(await waitFor(() => flow.stage === 'bnet_lobby', LOBBY_MS))) return false
  Object.assign(flow, { lobbySubPanel: 'create', gameName: `${name}${Date.now() % 100_000}`, gamePassword: `q${Date.now() % 9973}`, difficulty })
  await create(flow)
  return waitFor(() => host.phase() === 'ingame' && host.inWorld(), ENTER_MS)
}
