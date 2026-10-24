import type { OnlineSession } from '../session/online-session.ts'
import type { Minimap } from '../ui/minimap.ts'
import { PathGuide, type PathGuideHost } from './path-guide.ts'

export const createSessionGuide = (session: OnlineSession, minimap: Minimap): PathGuide => new PathGuide(sessionGuideHost(session, minimap))

const TOMBS = [66, 67, 68, 69, 70, 71, 72]
const ORIFICE = 152
const ACT_TWO = 1

export function sessionGuideHost(session: OnlineSession, minimap: Pick<Minimap, 'visible' | 'lastRenderStats'>): PathGuideHost {
  const world = () => session.world
  const tombs = new Map<string, number>()
  const trueTomb = () => {
    const map = session.mapService
    const key = map && map.getActiveAct() === ACT_TWO ? `${map.getActiveSeed()}:${map.getActiveDifficulty()}` : null
    if (!map || key === null) return world().questTombOffset
    if (!tombs.has(key)) tombs.set(key, TOMBS.findIndex((level) => map.peekLevelView(level)?.presetUnits.some((unit) => unit.type === 2 && unit.index === ORIFICE)))
    const found = tombs.get(key)!
    return found >= 0 ? found : world().questTombOffset
  }
  const carried = () => {
    const { inventory, cube, stash, equipment, cursor } = world().containers
    return new Set([...inventory.values(), ...cube.values(), ...stash.values(), ...equipment.values(), ...(cursor ? [cursor] : [])].map((item) => item.code.trim()))
  }
  return {
    areaId: () => world().areaId,
    self: () => ({ x: world().self.x, y: world().self.y, isDead: world().isDead }),
    character: () => `${world().self.name}:${world().difficulty}`,
    quests: () => ({ words: world().quests, gameWords: world().gameQuests, status: world().questStatusBytes, den: world().denMonstersRemaining, barbs: world().questBarbsRemaining, tomb: trueTomb() }),
    carries: (code) => carried().has(code),
    waypoints: () => world().waypoints,
    levelView: () => session.mapService?.getLoadedLevelView(world().areaId) ?? null,
    walkable: (view) => session.commandMapper.assists.walkableWithDoorsOpen(view),
    objects: () => world().getUnitsByType(2),
    monsters: () => world().getUnitsByType(1),
    toScreen: (x, y) => session.camera.subtileToScreen(x, y),
    coveredByHud: (x, y) => session.hudManager.isPointInterceptedByHud(x, y),
    automap: () => ({ visible: minimap.visible, viewport: minimap.lastRenderStats.viewport }),
  }
}
