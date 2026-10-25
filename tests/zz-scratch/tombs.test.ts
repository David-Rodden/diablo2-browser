import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
it('tombs', async () => {
  await import('../../tools/lib/node-map-loader.ts')
  const { MapService } = await import('../../src/client/map/map-service.ts')
  const svc = await MapService.fromPackedDir('/home/david/gaming/diablo2-web/public/act-packs/tiles')
  const out: string[] = []
  for (const seed of [53, 1, 2, 99, 12345]) {
    svc.loadAct({ act: 1, seed, difficulty: 0, areaId: 46, revealMode: 'all' })
    const hits = [66, 67, 68, 69, 70, 71, 72].map((l) => (svc.peekLevelView(l, 'all')?.presetUnits.filter((u: any) => u.type === 2 && u.index === 152).length ?? -1))
    out.push(`${seed} ${JSON.stringify(hits)} active ${svc.getActiveAct()} ${svc.getActiveSeed()}`)
  }
  writeFileSync('/home/david/.claude/jobs/8d6afec7/tmp/tombs.txt', out.join('\n'))
}, 900000)
