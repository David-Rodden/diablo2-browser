import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_ITEMMOD_FUNC_TABLE_113C,
  D2Common_10665_ApplyMonProp113c,
  DRLGOUTPLACE_StepMazeLinkNode113c,
  DRLGROOM_CheckLevelRoomsSeparation113c,
  DRLGROOM_CheckPointInRect113c,
  DRLGROOM_CompareOrthoNodes113c,
  DRLGROOM_PackAdjacentRooms113c,
  DRLGROOM_SortRoomExArrayByBounds113c,
  FIXED_POINT_STAT_SWITCH_6FD95668,
  ITEMMODS_ShiftStatValueIfFixedPoint113c,
  ITEMMODS_StubReturnOne113c,
} from '../../../src/d2kern-113c/common/drlg/drlg-room.ts';
import {
  DRLGROOMTILE_CountAllTileTypes113c,
  DRLGROOMTILE_CountPresetWallTileCells113c,
  DRLGROOMTILE_FindPresetRoomTile113c,
  DRLGROOMTILE_LookupWarpTileEntryIndex113c,
  DRLGROOMTILE_MaxInt113c,
  DRLGROOMTILE_MinInt113c,
  PATH_CheckFlag08_113c,
  PATH_CheckStepTargetDistance113c,
  WARP_LEVEL_RANGES_6FDDBD68,
  WARP_TILE_DESC_6FDDBF28,
} from '../../../src/d2kern-113c/common/drlg/room-tile.ts';
import { SparseMemory113c, type Memory113c } from '../../../src/d2kern-113c/mem/sparse-memory.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'oracle', 'k1', 'laneC', 'b004-vectors.ndjson');
const D2_DATA_DIR = process.env.D2_DATA_DIR || path.join(os.homedir(), 'd2-data');

interface MemBlock {
  addr: number;
  hex: string;
}

interface VectorRecord {
  va: string;
  name: string;
  caseId: string;
  args: number[];
  pre: MemBlock[];
  eax: number;
  retMask: number;
  post: MemBlock[];
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >>> 1);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function createGuardedMemory(pre: MemBlock[]): {
  raw: SparseMemory113c;
  mem: Memory113c;
  rogueWrites: number[];
} {
  const raw = new SparseMemory113c();
  const spans: Array<{ start: number; end: number }> = [];
  for (const blk of pre) {
    const start = blk.addr >>> 0;
    const bytes = hexToBytes(blk.hex);
    raw.loadBlock(start, bytes);
    spans.push({ start, end: (start + bytes.length) >>> 0 });
  }
  const rogueWrites: number[] = [];
  const checkWrite = (addr: number, width: number): void => {
    for (let i = 0; i < width; i++) {
      const a = (addr + i) >>> 0;
      if (!spans.some(s => a >= s.start && a < s.end)) {
        rogueWrites.push(a);
      }
    }
  };
  const mem: Memory113c = {
    alloc: size => raw.alloc(size),
    u8: p => raw.u8(p),
    u16: p => raw.u16(p),
    u32: p => raw.u32(p),
    setU8: (p, v) => {
      checkWrite(p, 1);
      raw.setU8(p, v);
    },
    setU16: (p, v) => {
      checkWrite(p, 2);
      raw.setU16(p, v);
    },
    setU32: (p, v) => {
      checkWrite(p, 4);
      raw.setU32(p, v);
    },
    get: (base, f, idx) => raw.get(base, f, idx),
    set: (base, f, v, idx = 0) => {
      const width = f.type === 'u8' ? 1 : f.type === 'u16' ? 2 : 4;
      checkWrite((base + f.off + idx * width) >>> 0, width);
      raw.set(base, f, v, idx);
    },
    fill: (p, len, v) => {
      checkWrite(p, len);
      raw.fill(p, len, v);
    },
  };
  return { raw, mem, rogueWrites };
}

type B004Runner = (mem: Memory113c, args: number[]) => number;

const B004_DISPATCH: Readonly<Record<string, B004Runner>> = {
  '0x6FD5CE90': (mem, [pPath]) => PATH_CheckFlag08_113c(mem, pPath!),
  '0x6FD5D0A0': (mem, [pPath, pOutStepVec]) =>
    PATH_CheckStepTargetDistance113c(mem, pPath!, pOutStepVec!),
  '0x6FD67B70': (mem, [pNode, ppRootNode]) =>
    DRLGOUTPLACE_StepMazeLinkNode113c(mem, pNode!, ppRootNode!),
  '0x6FD94540': (mem, [pRoomEx, ppOutRooms1]) =>
    DRLGROOM_PackAdjacentRooms113c(mem, pRoomEx!, ppOutRooms1!),
  '0x6FD945A0': (mem, [nCount, ppRoomsEx]) => {
    DRLGROOM_SortRoomExArrayByBounds113c(mem, nCount!, ppRoomsEx!);
    return 0;
  },
  '0x6FD94740': (mem, [pRect, nX, nY]) => DRLGROOM_CheckPointInRect113c(mem, pRect!, nX!, nY!),
  '0x6FD94870': (mem, [pOrth1, pOrth2]) => DRLGROOM_CompareOrthoNodes113c(mem, pOrth1!, pOrth2!),
  '0x6FD94EB0': (mem, [pLevel, nMinDist, pRoomEx1, pRoomEx2]) =>
    DRLGROOM_CheckLevelRoomsSeparation113c(mem, pLevel!, nMinDist!, pRoomEx1!, pRoomEx2!),
  '0x6FD95630': (_mem, [a0, a1, a2, a3, a4, a5, a6]) =>
    ITEMMODS_StubReturnOne113c(a0!, a1!, a2!, a3!, a4!, a5!, a6!),
  '0x6FD95640': (mem, [nStatId, pValue]) =>
    ITEMMODS_ShiftStatValueIfFixedPoint113c(mem, nStatId!, pValue!),
  '0x6FD95990': (mem, [a0, a1, a2, a3, a4, a5, a6, a7, a8, a9]) => {
    D2Common_10665_ApplyMonProp113c(mem, a0!, a1!, a2!, a3!, a4!, a5!, a6!, a7!, a8!, a9!);
    return 0;
  },
  '0x6FDB81A0': (mem, [pRoomEx, dwPresetFlags, bFloor, nX, nY]) =>
    DRLGROOMTILE_FindPresetRoomTile113c(mem, pRoomEx!, dwPresetFlags!, bFloor!, nX!, nY!),
  '0x6FDB8340': (_mem, [bIsType9, nLevelId, dwTileFlags]) =>
    DRLGROOMTILE_LookupWarpTileEntryIndex113c(bIsType9!, nLevelId!, dwTileFlags!),
  '0x6FDB85D0': (mem, [pRoomEx, bNoExtraHeight, pDefGrid, pTypeGrid, bNoExtraWidth]) => {
    DRLGROOMTILE_CountPresetWallTileCells113c(
      mem,
      pRoomEx!,
      bNoExtraHeight!,
      pDefGrid!,
      pTypeGrid!,
      bNoExtraWidth!
    );
    return 0;
  },
  '0x6FDB8660': (mem, [pRoomEx, pFlagGrid, bCheckRoomBounds, bNoExtraWidth, bNoExtraHeight]) => {
    DRLGROOMTILE_CountAllTileTypes113c(
      mem,
      pRoomEx!,
      pFlagGrid!,
      bCheckRoomBounds!,
      bNoExtraWidth!,
      bNoExtraHeight!
    );
    return 0;
  },
  '0x6FDB9DA0': (_mem, [a, b]) => DRLGROOMTILE_MaxInt113c(a!, b!),
  '0x6FDB9DB0': (_mem, [a, b]) => DRLGROOMTILE_MinInt113c(a!, b!),
};

function verifyVector(rec: VectorRecord, overrideRet?: number, mutatePostAddr?: number): void {
  const runner = B004_DISPATCH[rec.va];
  if (!runner) throw new Error(`Missing B004 runner for ${rec.va}`);
  const { raw, mem, rogueWrites } = createGuardedMemory(rec.pre);
  const actualRet = overrideRet !== undefined ? overrideRet : runner(mem, rec.args);
  if (mutatePostAddr !== undefined) {
    raw.setU8(mutatePostAddr, raw.u8(mutatePostAddr) ^ 0xff);
  }
  const mask = rec.retMask >>> 0;
  if (mask !== 0) {
    const got = ((actualRet >>> 0) & mask) >>> 0;
    const exp = ((rec.eax >>> 0) & mask) >>> 0;
    if (got !== exp) {
      throw new Error(
        `${rec.va} ${rec.name} [${rec.caseId}] eax mismatch: got 0x${got.toString(16)}, expected 0x${exp.toString(16)}`
      );
    }
  }
  if (rogueWrites.length > 0) {
    throw new Error(
      `${rec.va} ${rec.name} [${rec.caseId}] wrote outside tracked blocks at 0x${rogueWrites[0]!.toString(16)}`
    );
  }
  for (const blk of rec.post) {
    const start = blk.addr >>> 0;
    const len = blk.hex.length >>> 1;
    const actualHex = bytesToHex(raw.readBytes(start, len));
    if (actualHex !== blk.hex) {
      throw new Error(
        `${rec.va} ${rec.name} [${rec.caseId}] post-memory mismatch at 0x${start.toString(16)}: got ${actualHex}, expected ${blk.hex}`
      );
    }
  }
}

describe('Lane C B004 — Real D2Common.dll Differential Replay & Negative Controls (17 functions)', () => {
  const lines = fs
    .readFileSync(FIXTURE_PATH, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean);
  const vectors: VectorRecord[] = lines.map(l => JSON.parse(l) as VectorRecord);

  it('loads all 17 B004 function VAs with >= 4 real-DLL vectors each (112 vectors total)', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(112);
    const expectedVas = [
      '0x6FD5CE90',
      '0x6FD5D0A0',
      '0x6FD67B70',
      '0x6FD94540',
      '0x6FD945A0',
      '0x6FD94740',
      '0x6FD94870',
      '0x6FD94EB0',
      '0x6FD95630',
      '0x6FD95640',
      '0x6FD95990',
      '0x6FDB81A0',
      '0x6FDB8340',
      '0x6FDB85D0',
      '0x6FDB8660',
      '0x6FDB9DA0',
      '0x6FDB9DB0',
    ];
    for (const va of expectedVas) {
      const fnVectors = vectors.filter(v => v.va === va);
      expect(fnVectors.length, `Insufficient vectors for ${va}`).toBeGreaterThanOrEqual(4);
    }
  });

  for (const [va, runner] of Object.entries(B004_DISPATCH)) {
    it(`replays real D2Common.dll vectors byte-for-byte for ${va}`, () => {
      expect(runner).toBeTypeOf('function');
      const fnVectors = vectors.filter(v => v.va === va);
      expect(fnVectors.length).toBeGreaterThan(0);
      for (const rec of fnVectors) {
        verifyVector(rec);
      }
    });
  }

  it('supports custom itemModDispatch callback injection on D2Common_10665_ApplyMonProp113c with esi=0 prevResult latching', () => {
    const m = new SparseMemory113c();
    m.setU32(0x6fde9e1c, 0x20000000);
    m.setU32(0x200000a4, 0x20000100);
    m.setU32(0x200000ac, 2);
    m.setU32(0x6fdeb15c, 37);
    for (let i = 0; i < 37; i++) {
      m.setU32(0x6fdeb0c8 + i * 4, CANONICAL_ITEMMOD_FUNC_TABLE_113C[i]!);
    }
    const rec = 0x20000100 + 1 * 0x2e;
    m.fill(rec, 0x2e, 0);
    // Slot 0: funcId=18, nSet=1, wVal=11, wStat=3
    m.setU8(rec + 0x18 + 0, 18);
    m.setU8(rec + 0x02 + 0, 1);
    m.setU16(rec + 0x0a + 0, 11);
    m.setU16(rec + 0x20 + 0, 3);
    // Slot 1: funcId=8, nSet=0, wVal=22, wStat=4
    m.setU8(rec + 0x18 + 1, 8);
    m.setU8(rec + 0x02 + 1, 0);
    m.setU16(rec + 0x0a + 2, 22);
    m.setU16(rec + 0x20 + 2, 4);
    // Slot 2: funcId=9, nSet=1, wVal=33, wStat=5
    m.setU8(rec + 0x18 + 2, 9);
    m.setU8(rec + 0x02 + 2, 1);
    m.setU16(rec + 0x0a + 4, 33);
    m.setU16(rec + 0x20 + 4, 5);
    // Slot 3: funcId=25 (null entry in 0x6FDEB0C8 -> terminates loop before slot 4)
    m.setU8(rec + 0x18 + 3, 25);
    m.setU8(rec + 0x18 + 4, 8);

    const pItemProp = 0x20000200;
    m.setU32(pItemProp + 0x00, 1);
    m.setU32(pItemProp + 0x04, 2);
    m.setU32(pItemProp + 0x08, 10);
    m.setU32(pItemProp + 0x0c, 20);

    const calls: Array<{
      funcId: number;
      fp: number;
      nType: number;
      nSet: number;
      wStat: number;
      wVal: number;
      prevResult: number;
      nState: number;
      fStatListFlags: number;
      pStatList: number;
    }> = [];

    D2Common_10665_ApplyMonProp113c(
      m,
      1,
      0x20000240,
      0x20000280,
      77,
      3,
      99,
      pItemProp,
      5,
      0x0040,
      0x20000680,
      (_mem, funcId, fp, nType, _pUnit, _pItem, _pItemProp, nSet, wStat, wVal, prevResult, nState, fStatListFlags, pStatList) => {
        calls.push({ funcId, fp, nType, nSet, wStat, wVal, prevResult, nState, fStatListFlags, pStatList });
        return funcId === 18 ? 276 : 999;
      },
    );

    expect(calls).toEqual([
      {
        funcId: 18,
        fp: 0x6fd97350,
        nType: 1,
        nSet: 1,
        wStat: 3,
        wVal: 11,
        prevResult: 0,
        nState: 5,
        fStatListFlags: 0x0040,
        pStatList: 0x20000680,
      },
      {
        funcId: 8,
        fp: 0x6fd985d0,
        nType: 1,
        nSet: 0,
        wStat: 4,
        wVal: 22,
        prevResult: 276,
        nState: 5,
        fStatListFlags: 0x0040,
        pStatList: 0x20000680,
      },
      {
        funcId: 9,
        fp: 0x6fd98550,
        nType: 1,
        nSet: 1,
        wStat: 5,
        wVal: 33,
        prevResult: 276,
        nState: 5,
        fStatListFlags: 0x0040,
        pStatList: 0x20000680,
      },
    ]);
  });

  it('verifies B004 static tables (0x6FD95668, 0x6FDDBD68, 0x6FDDBF28) byte-for-byte against D2Common.dll', () => {
    const dllPath = path.join(D2_DATA_DIR, 'D2Common.dll');
    expect(fs.existsSync(dllPath)).toBe(true);
    const buf = fs.readFileSync(dllPath);

    // 1. FIXED_POINT_STAT_SWITCH_6FD95668 at VA 0x6FD95668 (212 bytes)
    const switchTblOff = 0x6fd95668 - 0x6fd50000;
    expect(FIXED_POINT_STAT_SWITCH_6FD95668.length).toBe(212);
    const switchBytes = new Uint8Array(buf.buffer, buf.byteOffset + switchTblOff, 212);
    expect(Array.from(FIXED_POINT_STAT_SWITCH_6FD95668)).toEqual(Array.from(switchBytes));

    // 2. WARP_LEVEL_RANGES_6FDDBD68 at VA 0x6FDDBD68 (37 entries * 12 bytes = 444 bytes)
    const warpRangesOff = 0x6fddbd68 - 0x6fd50000;
    expect(WARP_LEVEL_RANGES_6FDDBD68.length).toBe(37);
    for (let i = 0; i < 37; i++) {
      expect(WARP_LEVEL_RANGES_6FDDBD68[i]).toEqual([
        buf.readInt32LE(warpRangesOff + i * 12),
        buf.readInt32LE(warpRangesOff + i * 12 + 4),
        buf.readInt32LE(warpRangesOff + i * 12 + 8),
      ]);
    }

    // 3. WARP_TILE_DESC_6FDDBF28 at VA 0x6FDDBF28 (34 entries * 28 bytes, first 3 ints at +0/+4/+8)
    const warpDescOff = 0x6fddbf28 - 0x6fd50000;
    expect(WARP_TILE_DESC_6FDDBF28.length).toBe(34);
    for (let i = 0; i < 34; i++) {
      expect(WARP_TILE_DESC_6FDDBF28[i]).toEqual([
        buf.readInt32LE(warpDescOff + i * 28),
        buf.readInt32LE(warpDescOff + i * 28 + 4),
        buf.readInt32LE(warpDescOff + i * 28 + 8),
      ]);
    }
  });

  it('negative control: mutating return value or post-memory state is caught for every B004 function', () => {
    for (const va of Object.keys(B004_DISPATCH)) {
      const rec = vectors.find(v => v.va === va && (v.retMask !== 0 || v.post.length > 0))!;
      expect(rec).toBeDefined();
      if (rec.retMask !== 0) {
        expect(() => verifyVector(rec, (rec.eax ^ 1) >>> 0)).toThrow(/eax mismatch/);
      }
      if (rec.post.length > 0) {
        const firstAddr = rec.post[0]!.addr >>> 0;
        expect(() => verifyVector(rec, undefined, firstAddr)).toThrow(/post-memory mismatch/);
      }
    }
  });
});
