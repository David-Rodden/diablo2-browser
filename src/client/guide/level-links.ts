import { LEVEL_EDGES, WAYPOINT_LEVEL_PAIRS } from './level-graph.gen.ts'

export type LinkKind = 'walk' | 'portal'

export interface LevelLink {
  readonly to: number
  readonly kind: LinkKind
}

const ONE_WAY = new Set(['103>102'])

export const LEVEL_LINKS: ReadonlyMap<number, readonly LevelLink[]> = LEVEL_EDGES.filter(([from, to]) => !ONE_WAY.has(`${from}>${to}`)).reduce(
  (graph, [from, to, kind]) => graph.set(from, [...(graph.get(from) ?? []), { to, kind }]),
  new Map<number, LevelLink[]>(),
)

export const WAYPOINT_LEVELS: ReadonlyMap<number, number> = new Map(WAYPOINT_LEVEL_PAIRS)
