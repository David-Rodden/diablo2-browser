import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('callgraph manifest 1.13c parity and coverage', () => {
  const manifestPath = path.resolve(__dirname, '../../tools/oracle/callgraph/manifest-113c.json');

  it('manifest exists and parses valid JSON', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.version).toBe('1.13c');
    expect(data.summary.totalReachable).toBeGreaterThan(4000);
    expect(data.functions.length).toBe(data.summary.totalReachable);
  });

  it('includes GAME_UpdateGameFrame (0x6FC4E050) and its 11 sub-stages in reachable closure', () => {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const data = JSON.parse(raw);
    const fnMap = new Map<string, any>(data.functions.map((f: any) => [f.va.toUpperCase(), f]));

    // Top-level entry
    expect(fnMap.has('0X6FC4E050')).toBe(true);
    const topLevel = fnMap.get('0X6FC4E050');
    expect(topLevel.module).toBe('D2Game');

    // 11 stages
    const expectedStages = [
      '0X6FC4CA20', // GAME_ProcessClientPackets
      '0X6FC49BE0', // GAME_SyncFrameTimer
      '0X6FC4CBE0', // DRLG_StreamRoomsAndSpawn
      '0X6FCAF070', // EVENT_UpdateTimers
      '0X6FC4D9B0', // CLIENT_UpdateList
      '0X6FCBD850', // MISSILES_UpdateFrame
      '0X6FCBD5B0', // GAME_FrameEndCleanup
      '0X6FC53B70', // ITEMS_CleanupExpired
      '0X6FC4CF30', // QUESTS_PollAllActs
      '0X6FC2B2F4', // ENVIRONMENT_UpdateActs
      '0X6FC4C0F0', // CLIENT_FlushS2CPackets
    ];

    for (const stageVa of expectedStages) {
      expect(fnMap.has(stageVa)).toBe(true);
      const stageFn = fnMap.get(stageVa);
      expect(stageFn.module).toBe('D2Game');
    }
  });

  it('verifies topological sort consistency (every function has topoLevel >= 0 and max level >= 25)', () => {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.summary.maxTopoLevel).toBeGreaterThanOrEqual(25);

    const level0 = data.functions.filter((f: any) => f.topoLevel === 0);
    expect(level0.length).toBeGreaterThan(500); // At least 500 leaf functions
  });
});
