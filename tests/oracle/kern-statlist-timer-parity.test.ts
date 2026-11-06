import { describe, expect, it } from 'vitest'
import { Heap113c } from '../../src/server/route2/heap.ts'
import { SparseMemory113c } from '../../src/server/route2/sparse-memory.ts'
import {
  D2ActiveRoomStrc,
  D2ActiveRoomStrc_SIZE,
  D2GameStrc,
  D2StatListExStrc,
  D2StatListStrc,
  D2TimerStrc,
  D2UnitStrc,
} from '../../src/server/route2/layout.generated.ts'
import {
  CANONICAL_CORE_STATS_113C,
  D2NetPacketSink113c,
  EVENT_DeleteEventByType113c,
  EVENT_FreeNode113c,
  EVENT_GetNextEventFrame113c,
  EVENT_RemoveUnitEvents113c,
  EVENT_SetEventFull113c,
  EVENT_SetPersistentEventFull113c,
  EVENT_UpdateTimers113c,
  GAME_Create113c,
  GAME_SeedNext113c,
  GAME_SeedRoll113c,
  imul32,
  mulDiv113c,
  sar32,
  sdiv32,
  shl32,
  shr32,
  smod32,
  STATES_CheckGfxStateFlag113c,
  STATES_CheckState113c,
  STATES_ClearGfxStateFlag113c,
  STATES_ToggleState113c,
  STATLIST_AddStat113c,
  STATLIST_AllocList113c,
  STATLIST_CreateEx113c,
  STATLIST_GetStatListFromUnitAndState113c,
  STATLIST_GetUnitBaseStat113c,
  STATLIST_GetUnitStat113c,
  STATLIST_InsertSubList113c,
  STATLIST_RemoveSubList113c,
  STATLIST_SetStat113c,
  STATLIST_SetUnitStat113c,
  StatTableRegistry113c,
  SUNIT_GetNewUnitId113c,
  SUNIT_GetServerUnit113c,
  SUNIT_HASH_OFFSET_BY_TYPE_113C,
  SUNIT_InsertServerUnit113c,
  SUNIT_RemoveServerUnit113c,
  udiv32,
  umod32,
  UNIT_ITEM,
  UNIT_MISSILE,
  UNIT_MONSTER,
  UNIT_OBJECT,
  UNIT_PLAYER,
  UNIT_TILE,
  UNITFLAG_ISUPDATE,
  UNITROOM_AddUnitToRoom113c,
  UNITROOM_RefreshUnit113c,
  UNITROOM_RemoveUnitFromRoom113c,
  UNITS_Create113c,
  UNITS_GetX113c,
  UNITS_GetY113c,
  UNITS_InitPath113c,
} from '../../src/d2kern-113c/index.ts'

describe('d2kern-113c §3.2: x86 integer arithmetic primitives', () => {
  it('truncates signed division toward zero (matching x86 idiv, unlike Math.floor)', () => {
    expect(sdiv32(-7, 2)).toBe(-3)
    expect(smod32(-7, 2)).toBe(-1)
    expect(sdiv32(7, -2)).toBe(-3)
    expect(smod32(7, -2)).toBe(1)
    expect(() => sdiv32(1, 0)).toThrow(RangeError)
    expect(udiv32(0xffffffff, 2)).toBe(0x7fffffff)
    expect(umod32(0xffffffff, 2)).toBe(1)
    expect(imul32(0x10000, 0x10000)).toBe(0)
    expect(sar32(-256, 3)).toBe(-32)
    expect(shl32(3, 8)).toBe(768)
    expect(shr32(-1, 24)).toBe(255)
  })

  it('reproduces D2Common 0x6FD511E0 shortcut remainder truncation', () => {
    // edx = 1_100_037 > 0x100000 and ecx = 100 <= (edx >> 4): divides edx/ecx BEFORE multiplying by eax!
    expect(mulDiv113c(9, 1_100_037, 100)).toBe(99_000)
    expect(mulDiv113c(10, 500, 0)).toBe(0)
  })
})

describe('d2kern-113c §3.2: D2StatListStrc, D2StatListExStrc, EvalStatWithOps (op 1..13) & STATES', () => {
  it('maintains sorted BaseStats, zero-removal vs bKeepZero, and fMin floor clamping', () => {
    const heap = new Heap113c()
    const player = UNITS_Create113c(heap, UNIT_PLAYER, 4, 1) // Barbarian
    const listEx = STATLIST_CreateEx113c(heap, player, 0)

    // Out-of-order insertions stay binary-searchable and sorted in memory
    STATLIST_SetUnitStat113c(heap, player, 31, 150, 0) // armorclass
    STATLIST_SetUnitStat113c(heap, player, 0, 85, 0) // strength
    STATLIST_SetUnitStat113c(heap, player, 12, 24, 0) // level
    expect(STATLIST_GetUnitStat113c(heap, player, 0)).toBe(85)
    expect(STATLIST_GetUnitStat113c(heap, player, 12)).toBe(24)
    expect(STATLIST_GetUnitStat113c(heap, player, 31)).toBe(150)

    // Setting strength to 0 removes it from BOTH BaseStats and FullStats (bKeepZero == 0)
    STATLIST_SetUnitStat113c(heap, player, 0, 0, 0)
    expect(heap.get(listEx, D2StatListExStrc.wStatCount)).toBe(2)
    expect(heap.get(listEx, D2StatListExStrc.wFullStatCount)).toBe(2)

    // Setting mana (stat 8, bKeepZero == 1 in ItemStatCost.bin) to non-zero then 0 removes from BaseStats but keeps in FullStats
    STATLIST_SetUnitStat113c(heap, player, 8, 5120, 0)
    STATLIST_SetUnitStat113c(heap, player, 8, 0, 0)
    expect(heap.get(listEx, D2StatListExStrc.wStatCount)).toBe(2)
    expect(heap.get(listEx, D2StatListExStrc.wFullStatCount)).toBe(3)

    // Setting hitpoints (stat 6, bKeepZero == 0 in ItemStatCost.bin) to non-zero then 0 removes from BOTH
    STATLIST_SetUnitStat113c(heap, player, 6, 5120, 0)
    STATLIST_SetUnitStat113c(heap, player, 6, 0, 0)
    expect(heap.get(listEx, D2StatListExStrc.wStatCount)).toBe(2)
    expect(heap.get(listEx, D2StatListExStrc.wFullStatCount)).toBe(3)

    // 0x6FD88A9C / 0x6FD88AE1: absent fMin stat (maxhp = 7) returns 0; present negative entry clamps up to minAccr << valShift (256)
    expect(STATLIST_GetUnitStat113c(heap, player, 7)).toBe(0)
    STATLIST_SetUnitStat113c(heap, player, 7, -500, 0)
    expect(STATLIST_GetUnitStat113c(heap, player, 7)).toBe(256)
    expect(STATLIST_GetUnitBaseStat113c(heap, player, 7)).toBe(256)
    STATLIST_SetUnitStat113c(heap, player, 7, 0, 0)
    expect(STATLIST_GetUnitStat113c(heap, player, 7)).toBe(0)

    expect(STATLIST_GetUnitBaseStat113c(heap, player, 12)).toBe(24)
    STATLIST_SetUnitStat113c(heap, player, 12, 0, 0)
    expect(STATLIST_GetUnitStat113c(heap, player, 12)).toBe(0)
  })

  it('evaluates op 1, op 2, op 4, op 5, op 8, op 9, op 11, and op 13 across sub-lists', () => {
    const reg = new StatTableRegistry113c([
      ...CANONICAL_CORE_STATS_113C,
      { statId: 300, op: 3, opParam: 3, opBase: 12, opStats: [31] }, // op 3 test stat (% AC per level)
      { statId: 301, op: 11, opStats: [31] }, // op 11 test stat (% AC on unit)
      { statId: 302, op: 6, opStats: [31], evalByTime: (_u, v) => v * 3 }, // op 6 by-time flat
      { statId: 303, op: 7, opStats: [31], evalByTime: (_u, v) => v * 2 }, // op 7 by-time %
    ])

    const heap = new Heap113c()
    const barb = UNITS_Create113c(heap, UNIT_PLAYER, 4, 1) // Barbarian: +16/4=4 HP/vit, +4/4=1 stam/vit, +4/4=1 mana/ene
    const pListEx = STATLIST_CreateEx113c(heap, barb, 0)

    STATLIST_SetUnitStat113c(heap, barb, 12, 16, 0, reg) // level = 16
    STATLIST_SetUnitStat113c(heap, barb, 3, 25, 0, reg) // base vitality = 25 (hard points don't trigger op 9)
    STATLIST_SetUnitStat113c(heap, barb, 1, 10, 0, reg) // base energy = 10 (hard points don't trigger op 8)
    STATLIST_SetUnitStat113c(heap, barb, 7, 100 << 8, 0, reg) // base maxhp = 100 * 256 = 25600
    STATLIST_SetUnitStat113c(heap, barb, 9, 50 << 8, 0, reg) // base maxmana = 50 * 256 = 12800
    STATLIST_SetUnitStat113c(heap, barb, 11, 80 << 8, 0, reg) // base maxstamina = 80 * 256 = 20480

    // Base vitality/energy alone do NOT add op 8/9 bonus because nonBase = full - base == 0!
    expect(STATLIST_GetUnitStat113c(heap, barb, 7, 0, reg)).toBe(25600)
    expect(STATLIST_GetUnitStat113c(heap, barb, 9, 0, reg)).toBe(12800)

    // Attach an item/buff sub-list granting +10 vitality, +5 energy, +20% maxhp (76), +16/8 hp/lvl (216 = 2*lvl = +32 -> 8192? No: 216 value is in 256ths*8 or raw: (val * lvl) >> 3)
    const subBuff = STATLIST_AllocList113c(heap, 0, UNIT_PLAYER, 1, 32, 500) // Battle Orders state=32
    STATLIST_SetStat113c(heap, subBuff, 3, 10, 0, reg) // +10 bonus vitality -> Barb +40 HP (10240), +10 stam (2560)
    STATLIST_SetStat113c(heap, subBuff, 1, 5, 0, reg) // +5 bonus energy -> Barb +5 mana (1280)
    STATLIST_SetStat113c(heap, subBuff, 76, 20, 0, reg) // +20% maxhp on baseRef (25600 * 20 / 100 = +5120)
    STATLIST_SetStat113c(heap, subBuff, 216, 2048, 0, reg) // op 2: (2048 * 16) >> 3 = +4096
    STATLIST_InsertSubList113c(heap, pListEx, subBuff, reg)

    expect(STATLIST_GetStatListFromUnitAndState113c(heap, barb, 32)).toBe(subBuff)
    // Expected maxhp: 25600 (base) + 10240 (op 9: +10 vit) + 5120 (op 1: +20%) + 4096 (op 2: hp/lvl) = 45056
    expect(STATLIST_GetUnitStat113c(heap, barb, 7, 0, reg)).toBe(45056)
    // Expected maxmana: 12800 + 1280 (op 8: +5 ene) = 14080
    expect(STATLIST_GetUnitStat113c(heap, barb, 9, 0, reg)).toBe(14080)
    // Expected maxstamina: 20480 + 2560 (op 9: +10 vit) = 23040
    expect(STATLIST_GetUnitStat113c(heap, barb, 11, 0, reg)).toBe(23040)

    // Removing the sub-list restores exact base values!
    STATLIST_RemoveSubList113c(heap, subBuff, reg)
    expect(STATLIST_GetStatListFromUnitAndState113c(heap, barb, 32)).toBe(0)
    expect(STATLIST_GetUnitStat113c(heap, barb, 7, 0, reg)).toBe(25600)
    expect(STATLIST_GetUnitStat113c(heap, barb, 9, 0, reg)).toBe(12800)

    // Item op 13: local item_armor_percent (16) scales ONLY that item's base armorclass (31)
    const helm = UNITS_Create113c(heap, UNIT_ITEM, 100, 50)
    const helmEx = STATLIST_CreateEx113c(heap, helm, 0)
    STATLIST_SetUnitStat113c(heap, helm, 31, 120, 0, reg) // 120 base defense
    STATLIST_SetUnitStat113c(heap, helm, 16, 50, 0, reg) // +50% enhanced defense -> 180
    expect(STATLIST_GetUnitStat113c(heap, helm, 31, 0, reg)).toBe(180)

    // Equip helm onto Barbarian along with an op 4 (+AC/lvl) sub-list
    const eqSub = STATLIST_AllocList113c(heap)
    STATLIST_SetStat113c(heap, eqSub, 214, 12, 0, reg) // op 4: (12 * 16) >> 3 = +24 AC
    STATLIST_InsertSubList113c(heap, pListEx, helmEx, reg)
    STATLIST_InsertSubList113c(heap, pListEx, eqSub, reg)
    expect(STATLIST_GetUnitStat113c(heap, barb, 31, 0, reg)).toBe(204) // 180 + 24

    // op 3, op 6, op 7, op 11 on barb
    STATLIST_SetUnitStat113c(heap, barb, 300, 5, 0, reg) // op 3: ((5*16)>>3)=10% of 204 = +20
    STATLIST_SetUnitStat113c(heap, barb, 301, 50, 0, reg) // op 11: +50% of 204 = +102
    STATLIST_SetUnitStat113c(heap, barb, 302, 4, 0, reg) // op 6: 4*3 = +12
    STATLIST_SetUnitStat113c(heap, barb, 303, 5, 0, reg) // op 7: (5*2)=10% of 204 = +20
    expect(STATLIST_GetUnitStat113c(heap, barb, 31, 0, reg)).toBe(204 + 20 + 102 + 12 + 20)
  })

  it('tracks 184 active state bits and dirty/gfx bits on player/monster/missile only', () => {
    const m = new SparseMemory113c()
    const player = UNITS_Create113c(m, UNIT_PLAYER, 1, 1)
    const item = UNITS_Create113c(m, UNIT_ITEM, 10, 2)
    STATLIST_CreateEx113c(m, player, 0)
    STATLIST_CreateEx113c(m, item, 0)

    for (const sid of [0, 31, 32, 0x36, 159, 183]) {
      expect(STATES_CheckState113c(m, player, sid)).toBe(0)
      STATES_ToggleState113c(m, player, sid, true)
      const mask = (1 << (sid & 31)) >>> 0
      expect(STATES_CheckState113c(m, player, sid)).toBe(mask)
      expect(STATES_CheckGfxStateFlag113c(m, player, sid)).toBe(mask)

      // Clear dirty flag; redundant set(true) must NOT re-dirty the gfx flag (`0x6FD88799`)
      STATES_ClearGfxStateFlag113c(m, player, sid)
      expect(STATES_CheckGfxStateFlag113c(m, player, sid)).toBe(0)
      STATES_ToggleState113c(m, player, sid, true)
      expect(STATES_CheckGfxStateFlag113c(m, player, sid)).toBe(0)

      // Toggling off flips the bit and sets dirty/gfx flag again
      STATES_ToggleState113c(m, player, sid, false)
      expect(STATES_CheckState113c(m, player, sid)).toBe(0)
      expect(STATES_CheckGfxStateFlag113c(m, player, sid)).toBe(mask)
    }

    // Out-of-bounds states and item units always return 0 (`#10494 0x6FD83CD0`)
    expect(STATES_CheckState113c(m, player, -1)).toBe(0)
    expect(STATES_CheckState113c(m, player, 184)).toBe(0)
    STATES_ToggleState113c(m, item, 10, true)
    expect(STATES_CheckState113c(m, item, 10)).toBe(0)
  })
})

describe('d2kern-113c §3.2: D2UnitStrc, UNITS_GetX/Y, UNITROOM & SUNIT hash tables', () => {
  it('resolves dynamic vs static unit coordinates and manages room unit/update chains', () => {
    const heap = new Heap113c()
    const actFlagPtr = heap.alloc(4)
    const pRoom = heap.alloc(D2ActiveRoomStrc_SIZE)
    heap.set(pRoom, D2ActiveRoomStrc.pActUpdateFlag, actFlagPtr)

    const pPlayer = UNITS_Create113c(heap, UNIT_PLAYER, 0, 1)
    UNITS_InitPath113c(heap, pPlayer, 5123, 4987)
    const pChest = UNITS_Create113c(heap, UNIT_OBJECT, 5, 10)
    UNITS_InitPath113c(heap, pChest, 5130, 4990)

    expect(UNITS_GetX113c(heap, pPlayer)).toBe(5123)
    expect(UNITS_GetY113c(heap, pPlayer)).toBe(4987)
    expect(UNITS_GetX113c(heap, pChest)).toBe(5130)
    expect(UNITS_GetY113c(heap, pChest)).toBe(4990)

    UNITROOM_AddUnitToRoom113c(heap, pPlayer, pRoom)
    UNITROOM_AddUnitToRoom113c(heap, pChest, pRoom)
    expect(heap.get(pRoom, D2ActiveRoomStrc.nPlayers)).toBe(1)
    expect(heap.u32(actFlagPtr)).toBe(1)
    expect(heap.get(pPlayer, D2UnitStrc.dwFlags) & UNITFLAG_ISUPDATE).toBe(UNITFLAG_ISUPDATE)
    expect(heap.get(pRoom, D2ActiveRoomStrc.pUnitFirst)).toBe(pChest)
    expect(heap.get(pChest, D2UnitStrc.pRoomUnitNext)).toBe(pPlayer)

    // Duplicate refresh does not double-insert into pUpdateList
    UNITROOM_RefreshUnit113c(heap, pChest)
    expect(heap.get(pRoom, D2ActiveRoomStrc.pUpdateList)).toBe(pChest)
    expect(heap.get(pChest, D2UnitStrc.pRoomUpdateNext)).toBe(pPlayer)

    UNITROOM_RemoveUnitFromRoom113c(heap, pPlayer)
    expect(heap.get(pRoom, D2ActiveRoomStrc.nPlayers)).toBe(0)
    expect(heap.get(pPlayer, D2UnitStrc.dwFlags) & UNITFLAG_ISUPDATE).toBe(0)
    expect(heap.get(pRoom, D2ActiveRoomStrc.pUnitFirst)).toBe(pChest)
  })

  it('allocates SUNIT IDs with 0xFFFFFFFF->1 wrap and maintains descending hash buckets across types 0..5', () => {
    const heap = new Heap113c()
    const pGame = GAME_Create113c(heap, { initSeed: 0x12345678 })

    expect(SUNIT_GetNewUnitId113c(heap, pGame, UNIT_MONSTER)).toBe(1)
    expect(SUNIT_GetNewUnitId113c(heap, pGame, UNIT_MONSTER)).toBe(2)
    heap.set(pGame, D2GameStrc.dwLastUnitId, 0xfffffffe, UNIT_MISSILE)
    expect(SUNIT_GetNewUnitId113c(heap, pGame, UNIT_MISSILE)).toBe(1) // 0xFFFFFFFF wraps to 1!

    // Verify swapped item (+0x1720) vs missile (+0x1920) offsets and unbucketed tile (+0x1B20)
    expect(SUNIT_HASH_OFFSET_BY_TYPE_113C[UNIT_MISSILE]).toBe(0x1920)
    expect(SUNIT_HASH_OFFSET_BY_TYPE_113C[UNIT_ITEM]).toBe(0x1720)
    expect(SUNIT_HASH_OFFSET_BY_TYPE_113C[UNIT_TILE]).toBe(0x1b20)

    // Insert 3 monsters colliding in bucket (id & 0x7F == 5): IDs 5, 261, 133 -> chain must be 261 -> 133 -> 5
    const m5 = UNITS_Create113c(heap, UNIT_MONSTER, 0, 5, pGame)
    const m261 = UNITS_Create113c(heap, UNIT_MONSTER, 0, 261, pGame)
    const m133 = UNITS_Create113c(heap, UNIT_MONSTER, 0, 133, pGame)
    SUNIT_InsertServerUnit113c(heap, pGame, m5)
    SUNIT_InsertServerUnit113c(heap, pGame, m261)
    SUNIT_InsertServerUnit113c(heap, pGame, m133)

    const bucketHead = heap.u32(pGame + 0x1320 + 5 * 4)
    expect(bucketHead).toBe(m261)
    expect(heap.get(m261, D2UnitStrc.pGameHashNext)).toBe(m133)
    expect(heap.get(m133, D2UnitStrc.pGameHashNext)).toBe(m5)
    expect(SUNIT_GetServerUnit113c(heap, pGame, UNIT_MONSTER, 133)).toBe(m133)

    SUNIT_RemoveServerUnit113c(heap, pGame, m133)
    expect(SUNIT_GetServerUnit113c(heap, pGame, UNIT_MONSTER, 133)).toBe(0)
    expect(SUNIT_GetServerUnit113c(heap, pGame, UNIT_MONSTER, 5)).toBe(m5)

    // Type 5 (tile) uses single list head at +0x1B20 regardless of (id & 0x7F)
    const t1 = UNITS_Create113c(heap, UNIT_TILE, 0, 10, pGame)
    const t2 = UNITS_Create113c(heap, UNIT_TILE, 0, 99, pGame)
    SUNIT_InsertServerUnit113c(heap, pGame, t1)
    SUNIT_InsertServerUnit113c(heap, pGame, t2)
    expect(heap.get(pGame, D2GameStrc.pTileList)).toBe(t2)
    expect(SUNIT_GetServerUnit113c(heap, pGame, UNIT_TILE, 10)).toBe(t1)

    // PRNG helpers mutate D2GameStrc seed in-place
    const s0 = GAME_SeedNext113c(heap, pGame)
    expect(typeof s0).toBe('number')
    expect(GAME_SeedRoll113c(heap, pGame, 100)).toBeLessThan(100)
  })
})

describe('d2kern-113c §3.2: D2TimerStrc chunk growth, re-entrancy & 10,000-cycle stress', () => {
  it('grows pool beyond 600 nodes, enforces [2,0,1,3,4] partition order, and handles re-entrant self/next frees', () => {
    const heap = new Heap113c()
    const pGame = GAME_Create113c(heap)
    heap.set(pGame, D2GameStrc.dwGameFrame, 100)

    const pPlayer = UNITS_Create113c(heap, UNIT_PLAYER, 0, 1, pGame)
    const pMonster = UNITS_Create113c(heap, UNIT_MONSTER, 0, 2, pGame)
    const pObject = UNITS_Create113c(heap, UNIT_OBJECT, 0, 3, pGame)
    const pMissile = UNITS_Create113c(heap, UNIT_MISSILE, 0, 4, pGame)
    const pItem = UNITS_Create113c(heap, UNIT_ITEM, 0, 5, pGame)

    // Schedule > 600 events across two chunks (`0x7088` * 2 = 1200 capacity)
    for (let i = 0; i < 750; i++) {
      EVENT_SetEventFull113c(heap, pGame, pMonster, 2, 200 + (i % 64), 0, i, 0)
    }
    expect(EVENT_GetNextEventFrame113c(heap, pMonster, 2)).toBe(200)
    EVENT_RemoveUnitEvents113c(heap, pGame, pMonster)
    expect(heap.get(pMonster, D2UnitStrc.pEventFirst)).toBe(0)

    // Verify partition fire order at frame 101: missiles(3) -> players(0) -> monsters(1) -> objects(2) -> items(4)
    const log: string[] = []
    EVENT_SetEventFull113c(heap, pGame, pItem, 1, 101, 0, 50)
    EVENT_SetEventFull113c(heap, pGame, pObject, 1, 101, 0, 40)
    EVENT_SetEventFull113c(heap, pGame, pMonster, 1, 101, 0, 30)
    EVENT_SetEventFull113c(heap, pGame, pPlayer, 1, 101, 0, 20)
    EVENT_SetEventFull113c(heap, pGame, pMissile, 1, 101, 0, 10)
    // Persistent monster events run LIFO BEFORE timed monster events
    const p1 = EVENT_SetPersistentEventFull113c(heap, pGame, pMonster, 0, 0, 301, 0)
    const p2 = EVENT_SetPersistentEventFull113c(heap, pGame, pMonster, 0, 0, 302, 0)

    heap.set(pGame, D2GameStrc.dwGameFrame, 101)
    EVENT_UpdateTimers113c(heap, pGame, (m, g, _u, _evType, arg14, _arg18, _fn, node) => {
      log.push(String(arg14))
      if (node === p2) {
        // Re-entrant self-free (`fFlags & 0x01` -> deferred `0x08`) AND free of `pSavedNext` (`p1`)!
        EVENT_FreeNode113c(m, g, p2)
        EVENT_FreeNode113c(m, g, p1)
      }
    })
    // p2 freed p1 (`pSavedNext` advanced past p1!), and p2 itself was deferred-freed after returning!
    expect(log).toEqual(['10', '20', '302', '30', '40', '50'])
    const pTimer = heap.get(pGame, D2GameStrc.pTimer)
    expect(heap.get(pTimer, D2TimerStrc.pPersistentHead, 1)).toBe(0)

    // 10,000 alloc/schedule/delete/tick stress cycles without pool corruption
    let firedTotal = 0
    for (let step = 102; step < 10_102; step++) {
      heap.set(pGame, D2GameStrc.dwGameFrame, step)
      EVENT_SetEventFull113c(heap, pGame, pMonster, step % 14, step + 1 + (step % 7), 0x1234, step, 0)
      if (step % 5 === 0) {
        EVENT_DeleteEventByType113c(heap, pGame, pMonster, step % 14, 0x1234)
      }
      firedTotal += EVENT_UpdateTimers113c(heap, pGame, () => {})
    }
    expect(firedTotal).toBeGreaterThan(7_000)
  })

  it('captures and drains outbound S2C packets via D2NetPacketSink113c', () => {
    const heap = new Heap113c()
    const sink = new D2NetPacketSink113c()
    const buf = heap.alloc(8)
    heap.loadBlock(buf, new Uint8Array([0x15, 0x00, 0x01, 0x00, 0x00, 0x00, 0xaa]))
    expect(sink.sendPacketFromMemory(heap, 0, 1, buf, 7)).toBe(7)
    expect(sink.sendPacketBytes(0, 2, new Uint8Array([0x26, 0x01]))).toBe(2)
    expect(sink.pendingCount).toBe(2)

    const c1 = sink.drain(1)
    expect(c1).toHaveLength(1)
    expect(c1[0]!.opcode).toBe(0x15)
    expect(Array.from(c1[0]!.bytes)).toEqual([0x15, 0x00, 0x01, 0x00, 0x00, 0x00, 0xaa])
    expect(sink.pendingCount).toBe(1)
    expect(sink.drain()).toHaveLength(1)
  })
})
