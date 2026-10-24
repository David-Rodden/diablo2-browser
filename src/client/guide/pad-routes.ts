import type { SubTilePoint, SubTileWalkabilityGrid } from '../motion/pathfind.ts'
import { erodeToPlayerSize } from './flow-field.ts'

export interface Pad extends SubTilePoint {
  readonly classId: number
}

const NEAR = 6
const PAD_HOP = 12
const WALK_CACHE = 96
const UNWALKED = 0xffff
const distance = (a: SubTilePoint, b: SubTilePoint) => Math.hypot(a.x - b.x, a.y - b.y)

export class Regions {
  private readonly label: Int32Array
  private readonly slot: Int32Array
  private readonly sizes: number[] = []
  private readonly ox: number
  private readonly oy: number
  private readonly width: number
  private readonly height: number
  private readonly walks = new Map<number, Uint16Array>()

  constructor(grid: SubTileWalkabilityGrid) {
    const walkable = erodeToPlayerSize(grid)
    const [w, h] = [grid.subWidth, grid.subHeight]
    this.ox = grid.subOriginX ?? 0
    this.oy = grid.subOriginY ?? 0
    this.width = w
    this.height = h
    this.label = new Int32Array(w * h).fill(-1)
    this.slot = new Int32Array(w * h).fill(-1)
    for (let seed = 0; seed < w * h; seed++) {
      if (walkable[seed] === 0 || this.label[seed] !== -1) continue
      const region = this.sizes.length
      this.sizes.push(0)
      this.spread(seed, (cell) => {
        if (walkable[cell] === 0 || this.label[cell] !== -1) return false
        this.label[cell] = region
        this.slot[cell] = this.sizes[region]!++
        return true
      })
    }
  }

  private spread(seed: number, enter: (cell: number, from: number) => boolean): void {
    if (!enter(seed, -1)) return
    const queue = [seed]
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head]!
      const [x, y] = [cell % this.width, Math.floor(cell / this.width)]
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const [nx, ny] = [x + dx, y + dy]
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < this.width && ny < this.height && enter(ny * this.width + nx, cell)) queue.push(ny * this.width + nx)
        }
    }
  }

  private cellOf(point: SubTilePoint): number {
    const [x, y] = [Math.round(point.x) - this.ox, Math.round(point.y) - this.oy]
    for (let r = 0; r <= NEAR; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const [cx, cy] = [x + dx, y + dy]
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && cx >= 0 && cy >= 0 && cx < this.width && cy < this.height && this.label[cy * this.width + cx]! >= 0) return cy * this.width + cx
        }
    return -1
  }

  at(point: SubTilePoint): number {
    const cell = this.cellOf(point)
    return cell < 0 ? -1 : this.label[cell]!
  }

  walk(from: SubTilePoint, to: SubTilePoint): number {
    const [start, end] = [this.cellOf(from), this.cellOf(to)]
    if (start < 0 || end < 0 || this.label[start] !== this.label[end]) return Number.POSITIVE_INFINITY
    const [source, sink] = this.walks.has(end) ? [end, start] : [start, end]
    const steps = this.walksFrom(source)[this.slot[sink]!]!
    return steps === UNWALKED ? Number.POSITIVE_INFINITY : steps
  }

  private walksFrom(start: number): Uint16Array {
    const known = this.walks.get(start)
    if (known) return known
    if (this.walks.size >= WALK_CACHE) this.walks.clear()
    const region = this.label[start]!
    const steps = new Uint16Array(this.sizes[region]!).fill(UNWALKED)
    this.spread(start, (cell, from) => {
      if (this.label[cell] !== region || steps[this.slot[cell]!] !== UNWALKED) return false
      steps[this.slot[cell]!] = from < 0 ? 0 : Math.min(UNWALKED - 1, steps[this.slot[from]!]! + 1)
      return true
    })
    this.walks.set(start, steps)
    return steps
  }
}

export const guessPartner = <P extends Pad>(pad: P, pads: readonly P[], regions: Regions): P | undefined =>
  pads.filter((other) => other.classId === pad.classId && regions.at(other) !== regions.at(pad)).sort((a, b) => distance(a, pad) - distance(b, pad))[0]

export const presetPartners = <P extends Pad>(pads: readonly P[]): Map<P, P> =>
  new Map(pads.flatMap((pad, i) => {
    const partner = pads[i ^ 1]
    return partner && partner.classId === pad.classId ? [[pad, partner] as const] : []
  }))

export function firstPad<P extends Pad>(regions: Regions, pads: readonly P[], from: SubTilePoint, to: SubTilePoint, partnerOf: (pad: P) => P | undefined, usable: (pad: P) => boolean = () => true): P | null {
  const [start, goal] = [regions.at(from), regions.at(to)]
  if (start < 0 || goal < 0) return null
  const afoot = start === goal ? regions.walk(to, from) : Number.POSITIVE_INFINITY
  const spent = new Map<P, number>()
  const open: { readonly at: SubTilePoint; readonly region: number; readonly cost: number; readonly first: P | null; readonly done: boolean }[] = [{ at: from, region: start, cost: 0, first: null, done: false }]
  while (open.length > 0) {
    open.sort((a, b) => a.cost - b.cost)
    const node = open.shift()!
    if (node.cost >= afoot) return null
    if (node.done) return node.first
    if (node.region === goal && node.first) open.push({ ...node, cost: node.cost + regions.walk(to, node.at), done: true })
    for (const pad of pads) {
      const bound = Math.min(afoot, spent.get(pad) ?? Number.POSITIVE_INFINITY)
      if (regions.at(pad) !== node.region || node.cost + distance(node.at, pad) / Math.SQRT2 + PAD_HOP >= bound || (!node.first && !usable(pad))) continue
      const landing = partnerOf(pad)
      const region = landing ? regions.at(landing) : -1
      const cost = node.cost + regions.walk(pad, node.at) + PAD_HOP
      if (!landing || region < 0 || cost >= bound) continue
      spent.set(pad, cost)
      open.push({ at: landing, region, cost, first: node.first ?? pad, done: false })
    }
  }
  return null
}
