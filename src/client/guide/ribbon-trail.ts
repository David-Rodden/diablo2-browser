import type { SubTilePoint } from '../motion/pathfind.ts'

const SETTLE_MS = 110
const SNAP_DISTANCE = 6

const mix = (a: SubTilePoint, b: SubTilePoint, t: number): SubTilePoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

export function fromNearest(points: readonly SubTilePoint[], me: SubTilePoint): SubTilePoint[] {
  const nearest = points.slice(1).reduce(
    (best, b, i) => {
      const a = points[i]!
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      const t = length > 0 ? Math.max(0, Math.min(1, ((me.x - a.x) * (b.x - a.x) + (me.y - a.y) * (b.y - a.y)) / (length * length))) : 0
      const at = mix(a, b, t)
      const distance = Math.hypot(at.x - me.x, at.y - me.y)
      return distance < best.distance ? { distance, next: i + 1 } : best
    },
    { distance: Number.POSITIVE_INFINITY, next: 1 },
  )
  return [me, ...points.slice(nearest.next)]
}

export function rounded(points: readonly SubTilePoint[], rounds = 2): SubTilePoint[] {
  if (rounds === 0 || points.length < 3) return [...points]
  const cut = points.slice(1).flatMap((b, i) => [mix(points[i]!, b, 0.25), mix(points[i]!, b, 0.75)])
  return rounded([points[0]!, ...cut.slice(1, -1), points.at(-1)!], rounds - 1)
}

export function sampleAlong(points: readonly SubTilePoint[], from: number, to: number, spacing: number): SubTilePoint[] {
  const out: SubTilePoint[] = []
  let travelled = 0
  let next = from
  points.slice(1).forEach((b, i) => {
    const a = points[i]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    for (; next <= Math.min(to, travelled + length); next += spacing) out.push(mix(a, b, length > 0 ? (next - travelled) / length : 0))
    travelled += length
  })
  const [last, tail] = [points.at(-1), out.at(-1)]
  return last && travelled > from && travelled < to && (!tail || Math.hypot(last.x - tail.x, last.y - tail.y) > 1e-6) ? [...out, last] : out
}

export class RibbonTrail {
  private shown: readonly SubTilePoint[] = []
  private at = 0

  update(target: readonly SubTilePoint[], nowMs: number): readonly SubTilePoint[] {
    const blend = 1 - Math.exp(-Math.max(0, nowMs - this.at) / SETTLE_MS)
    const [head, wasHead] = [target[0], this.shown[0]]
    const snap = !head || !wasHead || Math.hypot(head.x - wasHead.x, head.y - wasHead.y) > SNAP_DISTANCE
    this.at = nowMs
    this.shown = target.map((p, i) => {
      const was = this.shown[Math.min(i, this.shown.length - 1)]
      return snap || i === 0 || !was ? p : mix(was, p, blend)
    })
    return this.shown
  }

  reset(): void {
    this.shown = []
  }
}
