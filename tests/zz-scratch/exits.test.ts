import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
it('exits', async () => {
  await import('../../tools/lib/node-map-loader.ts')
  const { MapService } = await import('../../src/client/map/map-service.ts')
  const svc = await MapService.fromPackedDir('/home/david/gaming/diablo2-web/public/act-packs/tiles')
  const out: string[] = []
  const probe = (act: number, areaId: number) => {
    svc.loadAct({ act, seed: 53, difficulty: 0, areaId, revealMode: 'all' })
    const v = svc.getLevelView(areaId, 'all')
    out.push(`${areaId}: ${JSON.stringify(v.entrances.map((e: any) => ({ to: e.toLevelId, kind: e.kind ?? e.type, x: e.x, y: e.y, obj: e.objectClass ?? e.classId })))}`)
    out.push(`   objs ${JSON.stringify(v.presetUnits.filter((u: any) => u.type === 2 && [74, 194, 195, 366, 367, 386, 404, 449, 547, 342, 376, 100, 152, 298].includes(u.index)).map((u: any) => [u.index, v.originX + u.subX, v.originY + u.subY]))}`)
  }
  for (const [act, area] of [[1, 40], [1, 47], [2, 80], [2, 92], [2, 93], [2, 83], [2, 94], [2, 100], [3, 107], [4, 109], [4, 120]]) {
    try { probe(act!, area!) } catch (e) { out.push(`${area}: ERR ${String(e).slice(0, 100)}`) }
  }
  writeFileSync('/home/david/.claude/jobs/8d6afec7/tmp/exits.txt', out.join('\n'))
}, 900000)
