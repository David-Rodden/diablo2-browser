import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
it('den', async () => {
  await import('../../tools/lib/node-map-loader.ts')
  const { MapService } = await import('../../src/client/map/map-service.ts')
  const { erodeToPlayerSize, FlowField } = await import('../../src/client/guide/flow-field.ts')
  const svc = await MapService.fromPackedDir('/home/david/gaming/diablo2-web/public/act-packs/tiles')
  svc.loadAct({ act: 0, seed: Number(process.env.SEED), difficulty: 0, areaId: 8, revealMode: 'all' })
  const v = svc.getLevelView(8, 'all')
  const dir = '/home/david/.claude/jobs/8d6afec7/tmp/den'
  writeFileSync(`${dir}/walk.bin`, v.walkable)
  writeFileSync(`${dir}/eroded.bin`, erodeToPlayerSize(v))
  const me = { x: 7717, y: 5048 }
  const f = new FlowField(v, me.x, me.y)
  const rooms = v.rooms.map((r: any) => ({ i: r.index, x: r.worldSubX, y: r.worldSubY, w: r.subW, h: r.subH, cx: r.worldSubX + r.subW / 2, cy: r.worldSubY + r.subH / 2, reach: f.pathFrom(r.worldSubX + r.subW / 2, r.worldSubY + r.subH / 2, 1, 1).length > 0, d: f.distanceFrom(r.worldSubX + r.subW / 2, r.worldSubY + r.subH / 2) }))
  writeFileSync(`${dir}/meta.json`, JSON.stringify({ ox: v.originX, oy: v.originY, w: v.subWidth, h: v.subHeight, objects: v.presetUnits.filter((u: any) => u.type === 2).map((u: any) => ({ x: v.originX + u.subX, y: v.originY + u.subY, cls: u.index })), monsters: v.presetUnits.filter((u: any) => u.type === 1).map((u: any) => [u.index, v.originX + u.subX, v.originY + u.subY]), rooms }))
}, 900000)
