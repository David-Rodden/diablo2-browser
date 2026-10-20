import { WAYPOINT_CLASS_IDS_113C } from '../../common/world/objects-meta.ts'
import { isClosedDoor } from '../input/play-assists.ts'
import type { LevelView } from '../map/level-view.ts'
import type { SubTilePoint } from '../motion/pathfind.ts'
import type { D2FontRenderer } from '../ui/font.ts'
import type { AutomapHudFootprint, AutomapViewportMetrics } from '../ui/minimap.ts'
import type { ClientUnit } from '../world/client-unit.ts'
import { FlowField } from './flow-field.ts'
import { currentGoal, levelName, nextStep, type Goal, type GuideMode, type Step } from './route.ts'

export interface PathGuideHost {
  readonly areaId: () => number
  readonly self: () => { readonly x: number; readonly y: number; readonly isDead: boolean }
  readonly quests: () => ArrayLike<number>
  readonly waypoints: () => ReadonlySet<number>
  readonly levelView: () => LevelView | null
  readonly walkable?: (view: LevelView) => Uint8Array
  readonly objects: () => readonly ClientUnit[]
  readonly toScreen: (subX: number, subY: number) => { readonly x: number; readonly y: number }
  readonly automap: () => { readonly visible: boolean; readonly viewport: AutomapViewportMetrics } | null
}

export type FieldSource = (view: LevelView, target: GuideTarget) => FlowField

export interface GuideTarget {
  readonly x: number
  readonly y: number
  readonly label: string
}

export interface GuidePlan {
  readonly goal: Goal
  readonly step: Step | null
  readonly hint: string
  readonly target: GuideTarget | null
  readonly path: readonly SubTilePoint[]
  readonly doors: readonly number[]
}

const GOLD = '#f2c46b'
const GOLD_GLOW = 'rgba(242, 196, 107, 0.35)'
const DOOR = '#9fd8ff'
const SHADE = 'rgba(0, 0, 0, 0.7)'
const REPLAN_MS = 400
const REPLAN_IDLE_MS = 3000
const REPLAN_MOVE = 3
const CHEVRON_SPACING = 3.5
const CHEVRONS = 14
const DOOR_NEAR_PATH = 3
const TEXT_LINE = 13

const hintFor = (step: Step | null, goal: Goal, target: GuideTarget | null): string => {
  if (step === null) return 'No known route from here'
  if (step.kind === 'portal') return step.hint
  if (step.kind === 'waypoint') return `Take the waypoint to ${levelName(step.level)}`
  if (step.kind === 'exit') return `${step.level === goal.level ? 'Enter' : 'Head to'} ${levelName(step.level)}`
  if (goal.inTown) return 'Talk to the quest giver'
  return target ? `Find ${target.label}` : `Explore ${levelName(step.level)}`
}

const GAP_DEPTH = 10

const seamGap = (view: LevelView, entrance: LevelView['entrances'][number]): readonly [number, number] | null => {
  const [inX, inY] = [Math.sign(entrance.interiorX - entrance.x), Math.sign(entrance.interiorY - entrance.y)]
  if (!entrance.span || (inX === 0) === (inY === 0)) return null
  const edge = (tile: number, inward: number) => (inward > 0 ? tile * 5 : tile * 5 + 4)
  const along = Array.from({ length: (entrance.span.to - entrance.span.from) * 5 }, (_, i) => entrance.span!.from * 5 + i)
  const walkable = (x: number, y: number) => x >= 0 && y >= 0 && x < view.subWidth && y < view.subHeight && view.walkable[y * view.subWidth + x] !== 0
  for (let depth = 0; depth < GAP_DEPTH; depth++) {
    const cells = along
      .map((a): readonly [number, number] => (inX !== 0 ? [edge(entrance.x, inX) + inX * depth, a] : [a, edge(entrance.y, inY) + inY * depth]))
      .filter(([x, y]) => walkable(x, y))
    if (cells.length > 0) return cells[Math.floor(cells.length / 2)]!
  }
  return null
}

const entranceTarget = (view: LevelView, level: number): GuideTarget | null => {
  const entrance = view.entrances.find((e) => e.toLevelId === level)
  if (!entrance) return null
  const [x, y] = entrance.warp ? [entrance.warp.subX, entrance.warp.subY] : (seamGap(view, entrance) ?? [entrance.x * 5 + 2, entrance.y * 5 + 2])
  return { x: view.originX + x, y: view.originY + y, label: levelName(level) }
}

const waypointTarget = (view: LevelView, objects: readonly ClientUnit[]): GuideTarget | null => {
  const unit = objects.find((o) => WAYPOINT_CLASS_IDS_113C.has(o.classId))
  const preset = view.presetUnits.find((u) => u.type === 2 && WAYPOINT_CLASS_IDS_113C.has(u.index))
  const point = unit ? { x: unit.x, y: unit.y } : preset ? { x: view.originX + preset.subX, y: view.originY + preset.subY } : null
  return point && { ...point, label: 'Waypoint' }
}

const landmarkTarget = (view: LevelView): GuideTarget | null => {
  const landmark = view.landmarks[0]
  return landmark ? { x: view.originX + landmark.subX, y: view.originY + landmark.subY, label: landmark.id } : null
}

const freshField = (host: PathGuideHost): FieldSource => (view, target) => new FlowField({ ...view, walkable: host.walkable?.(view) ?? view.walkable }, target.x, target.y)

export function planGuide(host: PathGuideHost, mode: GuideMode, fieldFor: FieldSource = freshField(host)): GuidePlan | null {
  const level = host.areaId()
  const view = host.levelView()
  const self = host.self()
  const goal = level > 0 ? currentGoal(level, host.quests(), mode) : null
  if (!goal || !view || self.isDead) return null
  const step = nextStep(level, goal.level, host.waypoints())
  const objects = host.objects()
  const target =
    step?.kind === 'exit' ? entranceTarget(view, step.level) : step?.kind === 'waypoint' ? waypointTarget(view, objects) : step?.kind === 'arrived' && !goal.inTown ? landmarkTarget(view) : null
  const path = target ? fieldFor(view, target).pathFrom(self.x, self.y) : []
  const doors = objects.filter((door) => isClosedDoor(door) && path.some((p) => Math.hypot(p.x - door.x, p.y - door.y) <= DOOR_NEAR_PATH)).map((door) => door.id)
  return { goal, step, hint: hintFor(step, goal, target), target, path, doors }
}

const isoRing = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number) => {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, rx / 2, 0, 0, Math.PI * 2)
}

const stroke = (ctx: CanvasRenderingContext2D, color: string, width: number) => Object.assign(ctx, { strokeStyle: color, lineWidth: width }).stroke()

const chevronStops = (path: readonly SubTilePoint[], start: SubTilePoint): (readonly [SubTilePoint, SubTilePoint])[] => {
  const stops: (readonly [SubTilePoint, SubTilePoint])[] = []
  let travelled = 0
  let next = CHEVRON_SPACING
  ;[start, ...path].forEach((point, i, all) => {
    const prev = all[i - 1]
    if (!prev) return
    const length = Math.hypot(point.x - prev.x, point.y - prev.y)
    while (length > 0 && travelled + length >= next && stops.length < CHEVRONS) {
      const t = (next - travelled) / length
      stops.push([{ x: prev.x + (point.x - prev.x) * t, y: prev.y + (point.y - prev.y) * t }, point])
      next += CHEVRON_SPACING
    }
    travelled += length
  })
  return stops
}

export class PathGuide {
  enabled = false
  mode: GuideMode = 'story'
  private plan: GuidePlan | null = null
  private plannedAt = { ms: Number.NEGATIVE_INFINITY, x: 0, y: 0, level: 0 }
  private field: { readonly view: LevelView; readonly field: FlowField } | null = null
  private readonly fieldFor: FieldSource = (view, target) => {
    const cached = this.field
    if (cached?.view === view && cached.field.targetX === target.x && cached.field.targetY === target.y) return cached.field
    return (this.field = { view, field: freshField(this.host)(view, target) }).field
  }

  constructor(private readonly host: PathGuideHost) {}

  get currentPlan(): GuidePlan | null {
    return this.plan
  }

  update(nowMs: number): GuidePlan | null {
    if (!this.enabled) return (this.plan = null)
    const { x, y } = this.host.self()
    const level = this.host.areaId()
    const since = nowMs - this.plannedAt.ms
    const moved = Math.hypot(x - this.plannedAt.x, y - this.plannedAt.y) >= REPLAN_MOVE
    if (since >= REPLAN_IDLE_MS || level !== this.plannedAt.level || (since >= REPLAN_MS && moved)) {
      this.plan = planGuide(this.host, this.mode, this.fieldFor)
      this.plannedAt = { ms: nowMs, x, y, level }
    }
    return this.plan
  }

  draw(ctx: CanvasRenderingContext2D, font: D2FontRenderer, nowMs: number, drawAutomapText: () => AutomapHudFootprint | null | void, width: number): AutomapHudFootprint | null | void {
    const plan = this.update(nowMs)
    if (plan) this.drawWorld(ctx, plan, nowMs)
    if (plan) this.drawAutomapPath(ctx, plan, nowMs, width)
    const footprint = drawAutomapText() ?? null
    return plan ? this.drawObjective(ctx, font, plan, footprint, width) : footprint
  }

  private drawWorld(ctx: CanvasRenderingContext2D, plan: GuidePlan, nowMs: number): void {
    const { toScreen, self, objects } = this.host
    const me = self()
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    chevronStops(plan.path, me).forEach(([at, toward], i) => {
      const a = toScreen(at.x, at.y)
      const b = toScreen(toward.x, toward.y)
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const [dx, dy] = [(b.x - a.x) / length, (b.y - a.y) / length]
      const wing = (along: number, side: number) => [a.x + dx * along - dy * side, a.y + dy * along + dx * side] as const
      ctx.globalAlpha = 0.85 * (1 - i / CHEVRONS) * (0.55 + 0.45 * Math.sin(nowMs / 260 - i * 0.7))
      ctx.beginPath()
      ctx.moveTo(...wing(-4, 5))
      ctx.lineTo(...wing(4, 0))
      ctx.lineTo(...wing(-4, -5))
      stroke(ctx, SHADE, 4.5)
      stroke(ctx, GOLD, 2)
    })
    ctx.globalAlpha = 1
    objects()
      .filter((door) => plan.doors.includes(door.id))
      .forEach((door) => {
        const { x, y } = toScreen(door.x, door.y)
        isoRing(ctx, x, y, 20)
        stroke(ctx, SHADE, 4)
        stroke(ctx, DOOR, 1.5)
      })
    if (plan.target) {
      const { x, y } = toScreen(plan.target.x, plan.target.y)
      const pulse = (nowMs % 1600) / 1600
      isoRing(ctx, x, y, 18 + pulse * 22)
      ctx.globalAlpha = 1 - pulse
      stroke(ctx, GOLD_GLOW, 2)
      ctx.globalAlpha = 1
      isoRing(ctx, x, y, 18)
      stroke(ctx, SHADE, 4)
      stroke(ctx, GOLD, 1.6)
    }
    ctx.restore()
  }

  private drawAutomapPath(ctx: CanvasRenderingContext2D, plan: GuidePlan, nowMs: number, width: number): void {
    const automap = this.host.automap()
    if (!automap?.visible) return
    const vp = automap.viewport
    const scale = vp.screenWidth > 0 ? width / vp.screenWidth : 1
    const me = this.host.self()
    const project = (p: SubTilePoint) => ({
      x: (vp.centerX - vp.effectivePanX + ((p.x - p.y - (me.x - me.y)) * 16) / vp.divisor) * scale,
      y: (vp.centerY - vp.effectivePanY + ((p.x + p.y - (me.x + me.y)) * 8) / vp.divisor) * scale,
    })
    const clip = { x: vp.vpX * scale, y: vp.vpY * scale, w: vp.vpW * scale, h: vp.vpH * scale }
    ctx.save()
    ctx.beginPath()
    ctx.rect(clip.x, clip.y, clip.w, clip.h)
    ctx.clip()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (plan.path.length > 0) {
      ctx.beginPath()
      ;[me, ...plan.path].map(project).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      stroke(ctx, SHADE, 3)
      ctx.setLineDash([4, 3])
      ctx.lineDashOffset = -nowMs / 60
      stroke(ctx, GOLD, 1.4)
      ctx.setLineDash([])
    }
    ctx.restore()
    if (!plan.target) return
    const goal = project(plan.target)
    const inset = 7
    const inside = goal.x >= clip.x + inset && goal.x <= clip.x + clip.w - inset && goal.y >= clip.y + inset && goal.y <= clip.y + clip.h - inset
    ctx.save()
    if (inside) {
      ctx.beginPath()
      ctx.arc(goal.x, goal.y, 3 + ((nowMs % 1200) / 1200) * 5, 0, Math.PI * 2)
      stroke(ctx, GOLD_GLOW, 1.5)
      ctx.beginPath()
      ctx.arc(goal.x, goal.y, 3, 0, Math.PI * 2)
      Object.assign(ctx, { fillStyle: GOLD }).fill()
      stroke(ctx, SHADE, 1)
    } else {
      const center = { x: clip.x + clip.w / 2, y: clip.y + clip.h / 2 }
      const angle = Math.atan2(goal.y - center.y, goal.x - center.x)
      const reach = Math.min((clip.w / 2 - inset) / Math.abs(Math.cos(angle) || 1e-6), (clip.h / 2 - inset) / Math.abs(Math.sin(angle) || 1e-6))
      ctx.translate(center.x + Math.cos(angle) * reach, center.y + Math.sin(angle) * reach)
      ctx.rotate(angle)
      ctx.beginPath()
      ctx.moveTo(5, 0)
      ctx.lineTo(-4, -4.5)
      ctx.lineTo(-2, 0)
      ctx.lineTo(-4, 4.5)
      ctx.closePath()
      Object.assign(ctx, { fillStyle: GOLD }).fill()
      stroke(ctx, SHADE, 1)
    }
    ctx.restore()
  }

  private drawObjective(ctx: CanvasRenderingContext2D, font: D2FontRenderer, plan: GuidePlan, footprint: AutomapHudFootprint | null, width: number): AutomapHudFootprint {
    const right = width - 16
    const top = (footprint?.bottom ?? 4) + TEXT_LINE
    const lines = [[plan.goal.title, 'white'], [plan.hint, 'gold']] as const
    lines.forEach(([text, color], i) => font.drawText(ctx, text, right, top + i * TEXT_LINE, { font: 'font8', color, align: 'right', shadow: true }))
    const left = right - Math.max(...lines.map(([text]) => font.measureText(text, 'font8')))
    return { titleLeft: Math.min(footprint?.titleLeft ?? left, left), bottom: top + TEXT_LINE + 4 }
  }
}
