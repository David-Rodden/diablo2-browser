/**
 * @file src/server/net/d2gs-kernel-bridge-113c.ts
 * [K5] Direct `ByteStream` <-> `d2kern-113c` (`D2Game.dll` / `D2Net.dll` / `Fog.dll` v1.13c)
 * host bridge (`D2gsKernelBridge113c`).
 *
 * Strictly isomorphic & deterministic:
 * - Lives outside `src/d2kern-113c/`, importing `src/d2kern-113c/**` one-way.
 * - Imports `src/netproto/index.ts` for `ByteStream`, `D2gsC2sFramer`, `D2gsSession`, and `D2gsAdapter`.
 * - Zero DOM globals, zero Node built-ins, zero ambient RNG or wall-clock calls.
 */

import {
  DUNGEON_AddClientToRoom113c,
  DUNGEON_GetLevelIdFromRoom113c,
  DUNGEON_RemoveClientFromRoom113c,
} from '../../d2kern-113c/common/dungeon.ts'
import { D2COMMON_SGPT_DATATABLES_VA_113C } from '../../d2kern-113c/common/inline-helpers.ts'
import {
  SKILLS_AllocSkillList113c,
  SKILLS_GetSkillById113c,
  SKILLS_SetSkillLevelOnUnit113c,
} from '../../d2kern-113c/common/skills.ts'
import {
  ITEMMODS_GetOrCreateStatList113c,
  STATES_CheckState113c,
  STATES_ToggleState113c,
  STATLIST_CreateEx113c,
  STATLIST_GetUnitStat113c,
  STATLIST_SetUnitStat113c,
} from '../../d2kern-113c/common/statlist.ts'
import {
  UNITROOM_AddUnitToRoom113c,
  UNITROOM_RemoveUnitFromRoom113c,
  UNITS_Create113c,
  UNITS_GetRoom113c,
  UNITS_GetX113c,
  UNITS_GetY113c,
  UNIT_MONSTER,
  UNIT_PLAYER,
} from '../../d2kern-113c/common/unit.ts'
import {
  NET_QueuePacketToClientBuffer113c,
  UNIT_SendAllStatesBitstreamToClient113c,
} from '../../d2kern-113c/game/boot-init-gap-a-113c.ts'
import {
  D2GAME_PACKET_SendMonsterAssign113c,
  D2GAME_PACKET_SendStatByteWordDword113c,
  D2GAME_PACKET_SendUnitStop113c,
  type BootInitGapBCallees113c,
} from '../../d2kern-113c/game/boot-init-gap-b-113c.ts'
import {
  C2S_DispatchPacketMem113c,
  D2ClientStrcOffsets,
  PLRMODE_NEUTRAL,
  type C2SPacketCallees113c,
} from '../../d2kern-113c/game/c2s-packet-113c.ts'
import {
  NET_SendReassignUnitPacket15_113c,
  NET_SendUnitMovePacket0F113c,
} from '../../d2kern-113c/game/k2-combat-core-w1-113c.ts'
import { NET_SendPacket0x23_AssignSkill113c } from '../../d2kern-113c/game/k2-gap-melee-dot-113c.ts'
import { NET_SendPacket07_RoomTileCoords_6FCABF50_113c } from '../../d2kern-113c/game/k2-w2b3-113c.ts'
import {
  NET_SendPacket95_LifeManaStamina_6FCAB7F0_113c,
  NET_SendPacket96_WalkVerify_6FCAB750_113c,
} from '../../d2kern-113c/game/k2-w4b4-113c.ts'
import { CLIENT_SendLoadActAndEnvStatePackets_6FCBD610_113c } from '../../d2kern-113c/game/k2-w4b6-113c.ts'
import { CLIENTS_SendHandshakeAndSetInitState1_6FC4AC60_113c } from '../../d2kern-113c/game/k2-w5b1-113c.ts'
import { NET_SendPacket59_AssignPlayerAndPartyRoster_6FCAD710_113c } from '../../d2kern-113c/game/k2-w5b2-113c.ts'
import {
  DUNGEON_CheckRoomIsTown113c,
  applyPlayerPacket113c,
  stepFallenSliceFrame113c,
  type FallenSliceWorld113c,
  type MutablePathRoom113c,
  type MutablePathUnit113c,
  type SlicePathCollisionGrid113c,
} from '../../d2kern-113c/game/replay-kernel-113c.ts'
import {
  bindRoomCollisionGrid113c,
  ensureD2CommonPathGlobals113c,
  ensureObjectsTxtTable113c,
  getCharStatsPure113c,
  getMonStatsTxtPtrPure113c,
} from '../../d2kern-113c/game/tables-bootstrap-113c.ts'
import { EVENT_InitTimerQueue113c } from '../../d2kern-113c/game/timer-wheel.ts'
import {
  D2ActStrc,
  D2ActStrc_SIZE,
  D2ActiveRoomStrc,
  D2ActiveRoomStrc_SIZE,
  D2DynamicPathStrc,
  D2DynamicPathStrc_SIZE,
  D2GameStrc,
  D2GameStrc_SIZE,
  D2InventoryStrc,
  D2InventoryStrc_SIZE,
  D2MonsterDataStrc,
  D2MonsterDataStrc_SIZE,
  D2PlayerDataStrc_SIZE,
  D2RoomCollisionGridStrc,
  D2RoomExStrc_SIZE,
  D2SkillListStrc,
  D2UnitStrc,
} from '../../d2kern-113c/mem/layout.generated.ts'
import { SparseMemory113c, type Memory113c } from '../../d2kern-113c/mem/sparse-memory.ts'
import {
  D2NET_MODE_SERVER_113C,
  D2NetPacketSink113c,
  type CapturedS2CPacket113c,
} from '../../d2kern-113c/net/packet-sink.ts'
import {
  BitWriter,
  D2gsAdapter,
  D2gsC2sFramer,
  D2gsSession,
  createMemoryStreamPair,
  getDefault113cItemDataTables,
  resolveS2cPacketSize,
  validateC2sPacket,
  type ByteStream,
  type CharClassId,
  type Clock,
  type D2gsGameLogonParams,
  type ItemDataTables,
  type ItemStat,
  type MemoryStream,
  type ServerEvent,
} from '../../netproto/index.ts'

/** Canonical 25fps (`40ms`) server tick interval of `D2Game.dll` v1.13c. */
export const D2GS_KERNEL_FRAME_MS_113C = 40

/** `D2Game.dll` -> `D2Net.dll` PE Import Address Table slots (`0x6FD18B48..0x6FD18B70`). */
export const D2GAME_NET_IAT_VA_113C = {
  getLastError_10003: 0x6fd18b48,
  getClientIp_10017: 0x6fd18b4c,
  disconnectClient_10000: 0x6fd18b50,
  dequeueQ1_10016: 0x6fd18b54,
  dequeueQ0_10035: 0x6fd18b58,
  dequeueQ2_10014: 0x6fd18b5c,
  getClientGameTag_10015: 0x6fd18b60,
  sendPacket_10002: 0x6fd18b64,
  dropClientSource_10001: 0x6fd18b68,
  setCloseCallback_10009: 0x6fd18b6c,
  setClientGameTag_10021: 0x6fd18b70,
} as const

const D2GAME_IAT_SGPT_DATATABLES_VA = 0x6fd1829c
const D2GAME_IAT_GDW_BITMASKS_VA = 0x6fd18be0
const D2CLIENT_STRC_SIZE_113C = 0x510
const D2PACKET_DATA_MAX_BATCH_113C = 0x200

const STAT_STRENGTH = 0
const STAT_ENERGY = 1
const STAT_DEXTERITY = 2
const STAT_VITALITY = 3
const STAT_STATPTS = 4
const STAT_NEWSKILLS = 5
const STAT_HITPOINTS = 6
const STAT_MAXHP = 7
const STAT_MANA = 8
const STAT_MAXMANA = 9
const STAT_STAMINA = 10
const STAT_MAXSTAMINA = 11
const STAT_LEVEL = 12
const STAT_EXPERIENCE = 13
const STAT_GOLD = 14
const STAT_GOLDBANK = 15
const STAT_VELOCITYPERCENT = 67
const STAT_ATTACKRATE = 68

const PLRMODE_WALK = 2
const PLRMODE_RUN = 3
const PLRMODE_TOWN_NEUTRAL = 5
const PLRMODE_TOWN_WALK = 6

export interface D2gsKernelBridgeOptions113c {
  /** Pre-initialized `SparseMemory113c` instance (allocates a fresh arena if omitted). */
  readonly memory?: SparseMemory113c
  /** Pre-allocated `D2GameStrc*` in `memory` (initializes a fresh 1.13c game world if omitted). */
  readonly pGame?: number
  /** Deterministic `dwInitSeed` (`pGame + 0x7C`, default `0x12345678`). */
  readonly initSeed?: number
  /** Deterministic `dwObjectSeed` (`pGame + 0x80`, default `0x9ABCDEF0`). */
  readonly objectSeed?: number
  /** Game difficulty `0..2` (`pGame + 0x6D`, default `0`). */
  readonly difficulty?: 0 | 1 | 2
  /** Expansion flag (`pGame + 0x70`, default `true`). */
  readonly expansion?: boolean
  /** Hardcore arena flag (`0x0800` on `pArena + 0x08`, default `false`). */
  readonly hardcore?: boolean
  /** Ladder flag (`pGame + 0x74`, default `false`). */
  readonly ladder?: boolean
  /** Act index `0..4` (`default 0`). */
  readonly act?: 0 | 1 | 2 | 3 | 4
  /** Starting area ID `1..136` (`default 1`, Rogue Encampment). */
  readonly areaId?: number
  /** Room subtile origin X (`default 5520`). */
  readonly roomSubtileX?: number
  /** Room subtile origin Y (`default 5880`). */
  readonly roomSubtileY?: number
  /** Room subtile width (`default 80`). */
  readonly roomSubtileWidth?: number
  /** Room subtile height (`default 80`). */
  readonly roomSubtileHeight?: number
  /** Default player spawn subtile X (`default roomSubtileX + 40`). */
  readonly spawnX?: number
  /** Default player spawn subtile Y (`default roomSubtileY + 40`). */
  readonly spawnY?: number
  /** Optional custom collision mask callback `(subX, subY) => u16Mask` (`0` = walkable floor). */
  readonly collisionMaskAt?: ((subX: number, subY: number) => number) | undefined
  /** Additional DRLG rooms (`0x07 RoomReveal`) revealed to clients upon room entry. */
  readonly extraRevealedRooms?:
    | readonly { readonly areaId: number; readonly tileX: number; readonly tileY: number }[]
    | undefined
  /** Optional initial player base stats (`statId -> rawValue`) hydrated before room-entry bootstrap. */
  readonly initialPlayerStats?: Readonly<Record<number, number>> | undefined
  /** Optional initial left-hand skill ID (`default 0`). */
  readonly initialLeftSkill?: number | undefined
  /** Optional initial right-hand skill ID (`default 0`). */
  readonly initialRightSkill?: number | undefined
  /** 1.13c item/stat tables for `0xA8` bitstream encoding & `D2gsAdapter` decoding. */
  readonly tables?: ItemDataTables | undefined
  /**
   * When `true` (default), inbound Queue 0 system/handshake packets (`0x68`, `0x6B`, `0x6D`, `0x69`)
   * arriving over an attached `ByteStream` are processed immediately (matching `D2Game`'s dedicated
   * system packet thread) so `D2gsSession` / `D2gsAdapter` handshakes complete without blocking.
   */
  readonly autoProcessSystemPackets?: boolean
}

export interface D2gsAttachClientStreamOptions113c {
  /** Explicit `dwClientId` (`>= 1`, auto-incremented if omitted). */
  readonly clientId?: number
  /** Simulated peer IPv4 string stored in `D2Net.#10017` (`default "127.0.0.1"`). */
  readonly address?: string
  /** Default character name if client enters via `0x6B` fast-path without `0x68` (`default "Hero"`). */
  readonly defaultCharName?: string
  /** Default character class `0..6` if client enters via `0x6B` fast-path (`default 1` Sorceress). */
  readonly defaultCharClass?: CharClassId
  /** Stream framing mode: `'compressed'` (`[0xAF, 0x01]` + `Fog.#10223` wire blocks, default) or `'uncompressed'`. */
  readonly wireFormat?: 'compressed' | 'uncompressed'
  /** Emit `[0xAF, 0x01]` greeting upon attach when `wireFormat === 'compressed'` (`default true`). */
  readonly sendCompressionGreeting?: boolean
}

export interface D2gsConnectAdapterOptions113c extends D2gsAttachClientStreamOptions113c {
  /** Optional `0x68 GameLogon` parameters for full `D2gsSession` handshake. */
  readonly logon?: D2gsGameLogonParams
  /** Optional `ItemDataTables` override for `D2gsAdapter`. */
  readonly tables?: ItemDataTables
  /** Optional `Clock` override for `D2gsSession` & `D2gsAdapter` (defaults to virtual kernel clock). */
  readonly clock?: Clock
  /** Optional listener registered on `D2gsAdapter` prior to `[0xAF, 0x01]` stream greeting. */
  readonly onEvent?: (ev: ServerEvent) => void
}

export interface UncompressedS2CPacketRecord113c {
  readonly queue: number
  readonly clientId: number
  readonly opcode: number
  readonly frame: number
  readonly bytes: Uint8Array
}

export interface WireS2CPacketRecord113c {
  readonly queue: number
  readonly clientId: number
  readonly firstOpcode: number
  readonly frame: number
  readonly uncompressedBytes: Uint8Array
  readonly wireBytes: Uint8Array
}

export interface D2gsBridgeClientHandle113c {
  readonly clientId: number
  readonly pClient: number
  readonly stream: ByteStream | null
  readonly wireFormat: 'compressed' | 'uncompressed'
  getPlayerPtr(): number
  getPlayerUnitId(): number
  getClientState(): number
  close(): void
}

export interface ConnectedD2gsAdapter113c {
  readonly clientId: number
  readonly adapter: D2gsAdapter
  readonly session: D2gsSession
  readonly clientStream: MemoryStream
  readonly serverStream: MemoryStream
  readonly handle: D2gsBridgeClientHandle113c
}

export interface SpawnBridgeMonsterOptions113c {
  readonly classId: number
  readonly x: number
  readonly y: number
  readonly unitId?: number | undefined
  readonly animMode?: number | undefined
  readonly hp?: number | undefined
  readonly maxHp?: number | undefined
}

export interface SpawnBridgeObjectOptions113c {
  readonly classId: number
  readonly x: number
  readonly y: number
  readonly unitId?: number | undefined
  readonly mode?: number | undefined
  readonly flags?: number | undefined
}

interface InternalClientEntry113c {
  readonly clientId: number
  pClient: number
  pPlayer: number
  playerUnitId: number
  charName: string
  charClass: CharClassId
  readonly stream: ByteStream | null
  readonly framer: D2gsC2sFramer
  readonly wireFormat: 'compressed' | 'uncompressed'
  readonly unsubs: Array<() => void>
  closed: boolean
}

const INITIAL_SYNC_STAT_IDS_113C: readonly number[] = [
  STAT_STRENGTH,
  STAT_ENERGY,
  STAT_DEXTERITY,
  STAT_VITALITY,
  STAT_STATPTS,
  STAT_NEWSKILLS,
  STAT_HITPOINTS,
  STAT_MAXHP,
  STAT_MANA,
  STAT_MAXMANA,
  STAT_STAMINA,
  STAT_MAXSTAMINA,
  STAT_LEVEL,
  STAT_EXPERIENCE,
  STAT_GOLD,
  STAT_GOLDBANK,
]

function isSystemQueue0C2sOpcode113c(opcode: number): boolean {
  return opcode >= 0x67 && opcode <= 0x70
}

function writeFixedAscii16(m: Memory113c, dstPtr: number, text: string): void {
  const base = dstPtr >>> 0
  const maxChars = Math.min(15, text.length)
  for (let i = 0; i < 16; i++) {
    m.setU8((base + i) >>> 0, i < maxChars ? text.charCodeAt(i) & 0x7f : 0)
  }
}

function readFixedAscii16(m: Memory113c, srcPtr: number): string {
  const base = srcPtr >>> 0
  let out = ''
  for (let i = 0; i < 16; i++) {
    const ch = m.u8((base + i) >>> 0)
    if (ch === 0) break
    out += String.fromCharCode(ch)
  }
  return out
}

/**
 * `[K5]` Direct `ByteStream` <-> `d2kern-113c` (`D2Game` + `D2Net` + `Fog` v1.13c) host bridge.
 */
export class D2gsKernelBridge113c {
  readonly m: SparseMemory113c
  readonly pGame: number
  readonly packetSink: D2NetPacketSink113c
  readonly tables: ItemDataTables

  private readonly actIdx: number
  private readonly areaId: number
  private readonly defaultRoomPtr: number
  private readonly spawnX: number
  private readonly spawnY: number
  private readonly wGameId: number
  private readonly autoProcessSystemPackets: boolean
  private readonly extraRevealedRooms: readonly {
    readonly areaId: number
    readonly tileX: number
    readonly tileY: number
  }[]
  private readonly initialPlayerStats: Readonly<Record<number, number>> | undefined
  private readonly initialLeftSkill: number
  private readonly initialRightSkill: number

  private readonly pRecvScratch: number
  private readonly pSendScratch: number
  private readonly pSmallScratch: number

  private nextClientId = 1
  private nextUnitId = 1
  private accumTimeMs = 0
  private virtualTickMs = 0

  private readonly clients = new Map<number, InternalClientEntry113c>()
  private readonly sliceClientById = new Map<number, number>()
  private readonly sliceWorld: FallenSliceWorld113c
  private readonly uncompressedOutbox: UncompressedS2CPacketRecord113c[] = []
  private readonly wireOutbox: WireS2CPacketRecord113c[] = []
  private readonly uncompressedListeners = new Set<(pkt: UncompressedS2CPacketRecord113c) => void>()
  private readonly wireListeners = new Set<(pkt: WireS2CPacketRecord113c) => void>()

  private readonly gapBCallees: BootInitGapBCallees113c

  constructor(options: D2gsKernelBridgeOptions113c = {}) {
    this.m = options.memory !== undefined ? options.memory : new SparseMemory113c()
    this.tables = options.tables !== undefined ? options.tables : getDefault113cItemDataTables()
    this.autoProcessSystemPackets = options.autoProcessSystemPackets !== false
    this.actIdx = options.act !== undefined ? options.act : 0
    this.areaId = options.areaId !== undefined ? options.areaId : 1
    this.extraRevealedRooms =
      options.extraRevealedRooms !== undefined ? options.extraRevealedRooms : []
    this.initialPlayerStats = options.initialPlayerStats
    this.initialLeftSkill = options.initialLeftSkill !== undefined ? options.initialLeftSkill : 0
    this.initialRightSkill = options.initialRightSkill !== undefined ? options.initialRightSkill : 0

    this.packetSink = new D2NetPacketSink113c({ netMode: D2NET_MODE_SERVER_113C })

    ensureD2CommonPathGlobals113c(this.m)
    ensureObjectsTxtTable113c(this.m)
    this.ensureD2GameBitMasksGlobal()

    const roomSubX = options.roomSubtileX !== undefined ? options.roomSubtileX : 5520
    const roomSubY = options.roomSubtileY !== undefined ? options.roomSubtileY : 5880
    const roomSubW = options.roomSubtileWidth !== undefined ? options.roomSubtileWidth : 80
    const roomSubH = options.roomSubtileHeight !== undefined ? options.roomSubtileHeight : 80
    this.spawnX = options.spawnX !== undefined ? options.spawnX : roomSubX + (roomSubW >> 1)
    this.spawnY = options.spawnY !== undefined ? options.spawnY : roomSubY + (roomSubH >> 1)

    if (options.pGame !== undefined && options.pGame !== 0) {
      this.pGame = options.pGame >>> 0
      this.wGameId = this.m.u16((this.pGame + 0x28) >>> 0) || 1
      const pAct = this.m.u32((this.pGame + 0xbc + this.actIdx * 4) >>> 0) >>> 0
      this.defaultRoomPtr = pAct !== 0 ? this.m.u32((pAct + 0x10) >>> 0) >>> 0 : 0
    } else {
      const booted = this.initFreshKernelWorld({
        initSeed: options.initSeed !== undefined ? options.initSeed : 0x12345678,
        objectSeed: options.objectSeed !== undefined ? options.objectSeed : 0x9abcdef0,
        difficulty: options.difficulty !== undefined ? options.difficulty : 0,
        expansion: options.expansion !== false,
        hardcore: options.hardcore === true,
        ladder: options.ladder === true,
        act: this.actIdx,
        areaId: this.areaId,
        roomSubX,
        roomSubY,
        roomSubW,
        roomSubH,
        collisionMaskAt: options.collisionMaskAt,
      })
      this.pGame = booted.pGame
      this.defaultRoomPtr = booted.pRoom
      this.wGameId = booted.wGameId
    }

    this.sliceWorld = this.buildSliceWorld()

    this.pRecvScratch = this.m.alloc(0x600) >>> 0
    this.pSendScratch = this.m.alloc(0x210) >>> 0
    this.pSmallScratch = this.m.alloc(0x140) >>> 0
    this.virtualTickMs = (this.frame * D2GS_KERNEL_FRAME_MS_113C) >>> 0

    this.gapBCallees = {
      sendPacketToClient: (mem, pClient, packet) => {
        this.queueBytesToClientBuffer(mem, pClient, packet)
      },
    }
  }

  /** Current deterministic 25fps `pGame->dwGameFrame` (`+0xA8`). */
  get frame(): number {
    return this.m.get(this.pGame, D2GameStrc.dwGameFrame) >>> 0
  }

  /** Current deterministic virtual server clock in milliseconds (`frame * 40`). */
  get tickMs(): number {
    return this.virtualTickMs >>> 0
  }

  /** Default active `D2ActiveRoomStrc*` in `SparseMemory113c`. */
  get pDefaultRoom(): number {
    return this.defaultRoomPtr >>> 0
  }

  private ensureD2GameBitMasksGlobal(): void {
    let existing = 0
    try {
      existing = this.m.u32(D2GAME_IAT_GDW_BITMASKS_VA) >>> 0
    } catch {
      existing = 0
    }
    if (existing === 0) {
      const pMasks = this.m.alloc(32 * 4) >>> 0
      for (let i = 0; i < 32; i++) {
        this.m.setU32((pMasks + i * 4) >>> 0, (1 << i) >>> 0)
      }
      this.m.setU32(D2GAME_IAT_GDW_BITMASKS_VA, pMasks)
    }

    let sgptIat = 0
    try {
      sgptIat = this.m.u32(D2GAME_IAT_SGPT_DATATABLES_VA) >>> 0
    } catch {
      sgptIat = 0
    }
    if (sgptIat === 0) {
      this.m.setU32(D2GAME_IAT_SGPT_DATATABLES_VA, D2COMMON_SGPT_DATATABLES_VA_113C)
    }

    let sgpt = 0
    try {
      sgpt = this.m.u32(D2COMMON_SGPT_DATATABLES_VA_113C) >>> 0
    } catch {
      sgpt = 0
    }
    if (sgpt !== 0) {
      let statesCount = 0
      try {
        statesCount = this.m.u32((sgpt + 0xc4) >>> 0) >>> 0
      } catch {
        statesCount = 0
      }
      if (statesCount === 0) {
        const nStates = 184
        const pStatesTxt = this.m.alloc(nStates * 0x3c) >>> 0
        this.m.setU32((sgpt + 0xbc) >>> 0, pStatesTxt)
        this.m.setU32((sgpt + 0xc4) >>> 0, nStates)
      }

      let iscCount = 0
      try {
        iscCount = this.m.u32((sgpt + 0xbd4) >>> 0) >>> 0
      } catch {
        iscCount = 0
      }
      if (iscCount === 0) {
        const nIsc = 359
        const pIscBase = this.m.alloc(nIsc * 0x144) >>> 0
        for (let id = 0; id < nIsc; id++) {
          const meta = this.tables.getStatCost(id)
          if (meta === undefined) continue
          const rec = (pIscBase + id * 0x144) >>> 0
          if (meta.signed) {
            this.m.setU8((rec + 0x04) >>> 0, 0x02)
          }
          this.m.setU8((rec + 0x08) >>> 0, meta.sendBits & 0xff)
          this.m.setU8((rec + 0x09) >>> 0, meta.sendParamBits & 0xff)
        }
        this.m.setU32((sgpt + 0xbcc) >>> 0, pIscBase)
        this.m.setU32((sgpt + 0xbd4) >>> 0, nIsc)
      }
    }
  }

  private buildSliceWorld(): FallenSliceWorld113c {
    const m = this.m
    let pTimer = m.get(this.pGame, D2GameStrc.pTimer) >>> 0
    if (pTimer === 0) {
      pTimer = EVENT_InitTimerQueue113c(m, this.pGame) >>> 0
    }
    const unitsByKey = new Map<string, number>()
    const monsterById = new Map<number, number>()
    const playerById = new Map<number, number>()
    const pathUnitByPtr = new Map<number, MutablePathUnit113c>()
    const roomByPtr = new Map<number, MutablePathRoom113c>()
    const minionIdsByLeaderId = new Map<number, number[]>()

    const registerRoom = (rPtr: number): void => {
      if (rPtr === 0 || roomByPtr.has(rPtr)) return
      const subX = m.get(rPtr, D2ActiveRoomStrc.nSubtileX) | 0
      const subY = m.get(rPtr, D2ActiveRoomStrc.nSubtileY) | 0
      const subW = m.get(rPtr, D2ActiveRoomStrc.nSubtileWidth) | 0
      const subH = m.get(rPtr, D2ActiveRoomStrc.nSubtileHeight) | 0
      const pColl = m.get(rPtr, D2ActiveRoomStrc.pCollisionGrid) >>> 0
      const pMap = pColl !== 0 ? (m.get(pColl, D2RoomCollisionGridStrc.pMapStart) >>> 0) : 0
      const grid: SlicePathCollisionGrid113c = {
        get: (x: number, y: number): number => {
          const rx = (x | 0) - subX
          const ry = (y | 0) - subY
          if (rx < 0 || ry < 0 || rx >= subW || ry >= subH || pMap === 0) return 0xffff
          return m.u16((pMap + (ry * subW + rx) * 2) >>> 0)
        },
        set: (x: number, y: number, val: number): void => {
          const rx = (x | 0) - subX
          const ry = (y | 0) - subY
          if (rx < 0 || ry < 0 || rx >= subW || ry >= subH || pMap === 0) return
          m.setU16((pMap + (ry * subW + rx) * 2) >>> 0, val & 0xffff)
        },
      }
      roomByPtr.set(rPtr, {
        ptr: rPtr,
        subX,
        subY,
        subW,
        subH,
        isTown: DUNGEON_CheckRoomIsTown113c(m, rPtr) !== 0,
        adjacentRooms: [],
        grid,
      })
    }

    for (let act = 0; act < 5; act++) {
      const pAct = m.u32((this.pGame + 0xbc + act * 4) >>> 0) >>> 0
      if (pAct === 0) continue
      let rPtr = m.u32((pAct + 0x10) >>> 0) >>> 0
      let guard = 0
      while (rPtr !== 0 && guard++ < 256) {
        registerRoom(rPtr)
        rPtr = m.get(rPtr, D2ActiveRoomStrc.pRoomNext) >>> 0
      }
    }

    const world: FallenSliceWorld113c = {
      m,
      pGame: this.pGame,
      pTimer,
      unitsByKey,
      monsterById,
      playerById,
      clientById: this.sliceClientById,
      pathUnitByPtr,
      roomByPtr,
      minionIdsByLeaderId,
      lastFrameOrd: [],
      lastFrameDmg: [],
    }
    this.syncUnitIntoSliceWorld(world)
    return world
  }

  private syncUnitIntoSliceWorld(world: FallenSliceWorld113c = this.sliceWorld): void {
    const m = this.m
    for (let typeIdx = 0; typeIdx < 5; typeIdx++) {
      for (let b = 0; b < 128; b++) {
        const bucketIdx = ((typeIdx << 7) + b) | 0
        let pUnit = m.get(this.pGame, D2GameStrc.pUnitHash, bucketIdx) >>> 0
        let guard = 0
        while (pUnit !== 0 && guard++ < 256) {
          const uType = m.get(pUnit, D2UnitStrc.dwUnitType) >>> 0
          const uId = m.get(pUnit, D2UnitStrc.dwUnitId) >>> 0
          const classId = m.get(pUnit, D2UnitStrc.dwClassId) >>> 0
          world.unitsByKey.set(`${uType}:${uId}`, pUnit)
          if (uType === UNIT_PLAYER) {
            world.playerById.set(uId, pUnit)
          } else if (uType === UNIT_MONSTER) {
            world.monsterById.set(uId, pUnit)
          }
          if (uType !== 4 && !world.pathUnitByPtr.has(pUnit)) {
            world.pathUnitByPtr.set(pUnit, {
              pUnit,
              pPath: m.get(pUnit, D2UnitStrc.pPath),
              dwUnitType: uType,
              dwClassId: classId,
              dwUnitId: uId,
              dwAnimMode: m.get(pUnit, D2UnitStrc.dwAnimMode),
              dwFlags: m.get(pUnit, D2UnitStrc.dwFlags),
              dwFlagEx: m.get(pUnit, D2UnitStrc.dwFlags2),
            })
          }
          pUnit = m.get(pUnit, D2UnitStrc.pGameHashNext) >>> 0
        }
      }
    }
  }

  private initFreshKernelWorld(cfg: {
    readonly initSeed: number
    readonly objectSeed: number
    readonly difficulty: 0 | 1 | 2
    readonly expansion: boolean
    readonly hardcore: boolean
    readonly ladder: boolean
    readonly act: number
    readonly areaId: number
    readonly roomSubX: number
    readonly roomSubY: number
    readonly roomSubW: number
    readonly roomSubH: number
    readonly collisionMaskAt?: ((subX: number, subY: number) => number) | undefined
  }): { readonly pGame: number; readonly pRoom: number; readonly wGameId: number } {
    const m = this.m
    const pGame = m.alloc(D2GameStrc_SIZE) >>> 0
    const wGameId = 1
    m.setU16((pGame + 0x28) >>> 0, wGameId)
    m.setU8((pGame + 0x6d) >>> 0, cfg.difficulty & 0xff)
    m.setU32((pGame + 0x70) >>> 0, cfg.expansion ? 1 : 0)
    m.setU32((pGame + 0x74) >>> 0, cfg.ladder ? 1 : 0)
    m.setU32((pGame + 0x7c) >>> 0, cfg.initSeed >>> 0)
    m.setU32((pGame + 0x80) >>> 0, cfg.objectSeed >>> 0)
    m.set(pGame, D2GameStrc.dwGameFrame, 0)

    const pArena = m.alloc(0x20) >>> 0
    const arenaFlags = ((cfg.hardcore ? 0x0804 : 0x0004) | (cfg.expansion ? 0x00100000 : 0)) >>> 0
    m.setU32(pArena, cfg.areaId >>> 0)
    m.setU32((pArena + 0x08) >>> 0, arenaFlags)
    m.setU32((pGame + 0x1d28) >>> 0, pArena)

    EVENT_InitTimerQueue113c(m, pGame)

    const pAct = m.alloc(D2ActStrc_SIZE) >>> 0
    const pActMisc = m.alloc(0x4c0) >>> 0
    const pEnv = m.alloc(0x40) >>> 0
    const pLevel = m.alloc(0x240) >>> 0
    m.setU32((pLevel + 0x1d0) >>> 0, cfg.areaId >>> 0)

    const pRoomEx = m.alloc(D2RoomExStrc_SIZE) >>> 0
    const tileX = Math.trunc(cfg.roomSubX / 5)
    const tileY = Math.trunc(cfg.roomSubY / 5)
    const tileW = Math.trunc(cfg.roomSubW / 5)
    const tileH = Math.trunc(cfg.roomSubH / 5)
    m.setU32((pRoomEx + 0x08) >>> 0, pAct)
    m.setU32((pRoomEx + 0x24) >>> 0, 2)
    m.setU32((pRoomEx + 0x34) >>> 0, tileX >>> 0)
    m.setU32((pRoomEx + 0x38) >>> 0, tileY >>> 0)
    m.setU32((pRoomEx + 0x3c) >>> 0, tileW >>> 0)
    m.setU32((pRoomEx + 0x40) >>> 0, tileH >>> 0)
    m.setU32((pRoomEx + 0x58) >>> 0, pLevel)

    const pRoom = m.alloc(D2ActiveRoomStrc_SIZE) >>> 0
    m.set(pRoom, D2ActiveRoomStrc.pRoomEx, pRoomEx)
    m.set(pRoom, D2ActiveRoomStrc.pAct, pAct)
    m.set(pRoom, D2ActiveRoomStrc.nSubtileX, cfg.roomSubX >>> 0)
    m.set(pRoom, D2ActiveRoomStrc.nSubtileY, cfg.roomSubY >>> 0)
    m.set(pRoom, D2ActiveRoomStrc.nSubtileWidth, cfg.roomSubW >>> 0)
    m.set(pRoom, D2ActiveRoomStrc.nSubtileHeight, cfg.roomSubH >>> 0)
    m.set(pRoom, D2ActiveRoomStrc.nTileX, tileX >>> 0)
    m.set(pRoom, D2ActiveRoomStrc.nTileY, tileY >>> 0)
    m.set(pRoom, D2ActiveRoomStrc.nTileWidth, tileW >>> 0)
    m.set(pRoom, D2ActiveRoomStrc.nTileHeight, tileH >>> 0)
    m.setU32((pRoomEx + 0x28) >>> 0, pRoom)

    const ppRoomsNear = m.alloc(16) >>> 0
    m.setU32(ppRoomsNear, pRoom)
    m.set(pRoom, D2ActiveRoomStrc.ppRoomsNear, ppRoomsNear)
    m.set(pRoom, D2ActiveRoomStrc.nRoomsNear, 1)

    const maskFn =
      cfg.collisionMaskAt !== undefined
        ? cfg.collisionMaskAt
        : (sx: number, sy: number): number => {
            if (
              sx <= cfg.roomSubX ||
              sy <= cfg.roomSubY ||
              sx >= cfg.roomSubX + cfg.roomSubW - 1 ||
              sy >= cfg.roomSubY + cfg.roomSubH - 1
            ) {
              return 0x0001
            }
            return 0x0000
          }
    bindRoomCollisionGrid113c(m, pRoom, cfg.roomSubX, cfg.roomSubY, cfg.roomSubW, cfg.roomSubH, maskFn)

    m.set(pAct, D2ActStrc.dwMapSeed, cfg.initSeed >>> 0)
    m.set(pAct, D2ActStrc.nAct, cfg.act >>> 0)
    m.set(pAct, D2ActStrc.dwTownId, cfg.areaId >>> 0)
    m.set(pAct, D2ActStrc.pRoom1, pRoom)
    m.set(pAct, D2ActStrc.pEnvironment, pEnv)
    m.set(pAct, D2ActStrc.pActMisc, pActMisc)
    m.setU32((pGame + 0xbc + cfg.act * 4) >>> 0, pAct)

    return { pGame, pRoom, wGameId }
  }

  /** Subscribe to discrete uncompressed S2C game-stream packets emitted by `d2kern-113c`. */
  onUncompressedS2CPacket(cb: (pkt: UncompressedS2CPacketRecord113c) => void): () => void {
    this.uncompressedListeners.add(cb)
    return () => {
      this.uncompressedListeners.delete(cb)
    }
  }

  /** Subscribe to `Fog.#10223`-framed D2GS wire chunks emitted by `D2Net.#10002`. */
  onWirePacket(cb: (pkt: WireS2CPacketRecord113c) => void): () => void {
    this.wireListeners.add(cb)
    return () => {
      this.wireListeners.delete(cb)
    }
  }

  /** Drain captured discrete uncompressed S2C packets (optionally filtered by `clientId`). */
  drainUncompressedS2CPackets(clientId?: number): UncompressedS2CPacketRecord113c[] {
    if (clientId === undefined) {
      return this.uncompressedOutbox.splice(0, this.uncompressedOutbox.length)
    }
    const cid = clientId >>> 0
    const matched: UncompressedS2CPacketRecord113c[] = []
    const kept: UncompressedS2CPacketRecord113c[] = []
    for (let i = 0; i < this.uncompressedOutbox.length; i++) {
      const item = this.uncompressedOutbox[i]!
      if (item.clientId === cid) matched.push(item)
      else kept.push(item)
    }
    this.uncompressedOutbox.length = 0
    this.uncompressedOutbox.push(...kept)
    return matched
  }

  /** Drain captured `Fog.#10223` D2GS wire blocks (optionally filtered by `clientId`). */
  drainWirePackets(clientId?: number): WireS2CPacketRecord113c[] {
    if (clientId === undefined) {
      return this.wireOutbox.splice(0, this.wireOutbox.length)
    }
    const cid = clientId >>> 0
    const matched: WireS2CPacketRecord113c[] = []
    const kept: WireS2CPacketRecord113c[] = []
    for (let i = 0; i < this.wireOutbox.length; i++) {
      const item = this.wireOutbox[i]!
      if (item.clientId === cid) matched.push(item)
      else kept.push(item)
    }
    this.wireOutbox.length = 0
    this.wireOutbox.push(...kept)
    return matched
  }

  /**
   * Attach a server-side `ByteStream` endpoint (`client <-> D2gsKernelBridge113c`).
   * Automatically frames incoming C2S bytes (`0x01..0x6D`) and drains outgoing `D2Net.#10002`
   * packets onto `stream`.
   */
  attachClientStream(
    stream: ByteStream,
    options: D2gsAttachClientStreamOptions113c = {},
  ): D2gsBridgeClientHandle113c {
    const clientId =
      options.clientId !== undefined ? options.clientId >>> 0 : this.nextClientId++
    if (clientId >= this.nextClientId) {
      this.nextClientId = (clientId + 1) >>> 0
    }
    const wireFormat = options.wireFormat !== undefined ? options.wireFormat : 'compressed'
    const address = options.address !== undefined ? options.address : '127.0.0.1'
    const defaultCharName = options.defaultCharName !== undefined ? options.defaultCharName : 'Hero'
    const defaultCharClass: CharClassId =
      options.defaultCharClass !== undefined ? options.defaultCharClass : 1

    const entry = this.ensureClientEntry(clientId, {
      stream,
      address,
      defaultCharName,
      defaultCharClass,
      wireFormat,
    })

    const unsubData = stream.onData((chunk) => {
      if (entry.closed) return
      this.feedC2SStreamChunk(clientId, chunk)
    })
    const unsubClose = stream.onClose(() => {
      if (entry.closed) return
      entry.closed = true
      this.packetSink.dispatchIat(D2GAME_NET_IAT_VA_113C.disconnectClient_10000, this.m, [clientId])
    })
    entry.unsubs.push(unsubData, unsubClose)

    if (wireFormat === 'compressed' && options.sendCompressionGreeting !== false) {
      // `D2Net` initial server greeting `[0xAF, 0x01]` on Queue `0`:
      // `frameServerPacket113c(0, [0xAF, 0x01])` passes `[0xAF, 0x01]` raw uncompressed!
      this.m.setU8(this.pSendScratch, 0xaf)
      this.m.setU8((this.pSendScratch + 1) >>> 0, 0x01)
      this.packetSink.dispatchIat(D2GAME_NET_IAT_VA_113C.sendPacket_10002, this.m, [
        0,
        clientId,
        this.pSendScratch,
        2,
      ])
      this.drainSinkToConsumers()
    }

    return this.createClientHandle(entry)
  }

  /**
   * Create an in-memory `MemoryStream` pair, attach the server end to `D2gsKernelBridge113c`,
   * and connect a `D2gsSession` + `D2gsAdapter` on the client end through the full 1.13c
   * `[0xAF, 0x01] -> 0x68 -> 0x01/0x02 -> 0x6B -> 0x03..0x04` wire handshake.
   */
  connectD2gsAdapter(options: D2gsConnectAdapterOptions113c = {}): ConnectedD2gsAdapter113c {
    const [clientStream, serverStream] = createMemoryStreamPair()
    const defaultCharName = options.defaultCharName !== undefined ? options.defaultCharName : 'Hero'
    const defaultCharClass: CharClassId =
      options.defaultCharClass !== undefined ? options.defaultCharClass : 1
    const logon: D2gsGameLogonParams =
      options.logon !== undefined
        ? options.logon
        : {
            gameHash: 0xdeadbeef,
            gameToken: this.wGameId,
            charClass: defaultCharClass,
            versionByte: 0x0d,
            charName: defaultCharName,
          }

    const virtualClock: Clock =
      options.clock !== undefined
        ? options.clock
        : {
            now: () => (1000 + this.virtualTickMs) >>> 0,
            setTimeout: () => () => {},
            setInterval: () => () => {},
          }

    const session = new D2gsSession({
      stream: clientStream,
      logon,
      clock: virtualClock,
    })
    const adapter = new D2gsAdapter({
      session,
      tables: options.tables !== undefined ? options.tables : this.tables,
      clock: virtualClock,
    })
    if (options.onEvent !== undefined) {
      adapter.onEvent(options.onEvent)
    }

    const handle = this.attachClientStream(serverStream, {
      ...options,
      defaultCharName: logon.charName,
      defaultCharClass: logon.charClass as CharClassId,
      wireFormat: 'compressed',
    })

    return {
      clientId: handle.clientId,
      adapter,
      session,
      clientStream,
      serverStream,
      handle,
    }
  }

  /** Register a headless client (without a `ByteStream`) for direct packet-level testing. */
  registerHeadlessClient(
    clientId = this.nextClientId++,
    options: Omit<D2gsAttachClientStreamOptions113c, 'clientId'> = {},
  ): D2gsBridgeClientHandle113c {
    if (clientId >= this.nextClientId) {
      this.nextClientId = (clientId + 1) >>> 0
    }
    const entry = this.ensureClientEntry(clientId >>> 0, {
      stream: null,
      address: options.address !== undefined ? options.address : '127.0.0.1',
      defaultCharName: options.defaultCharName !== undefined ? options.defaultCharName : 'Hero',
      defaultCharClass: options.defaultCharClass !== undefined ? options.defaultCharClass : 1,
      wireFormat: options.wireFormat !== undefined ? options.wireFormat : 'compressed',
    })
    return this.createClientHandle(entry)
  }

  /**
   * Feed an arbitrary raw C2S stream chunk (potentially fragmented or coalesced multiple packets)
   * through `D2gsC2sFramer` (`D2Net.#10006` `0x6FBF65D0`) into `D2NetPacketSink113c`.
   */
  feedC2SStreamChunk(clientId: number, chunk: Uint8Array): number {
    const cid = clientId >>> 0
    const entry = this.ensureClientEntry(cid, {
      stream: null,
      address: '127.0.0.1',
      defaultCharName: 'Hero',
      defaultCharClass: 1,
      wireFormat: 'compressed',
    })
    const packets = entry.framer.push(chunk)
    for (let i = 0; i < packets.length; i++) {
      this.feedC2SPacket(cid, packets[i]!)
    }
    return packets.length
  }

  /**
   * Enqueue a discrete C2S packet (`0x01..0x6D`) onto `D2NetPacketSink113c` Queue `0` (`#10035`,
   * system/handshake `0x67..0x70`) or Queue `1` (`#10016`, gameplay `0x01..0x66`).
   */
  feedC2SPacket(clientId: number, packetBytes: Uint8Array): boolean {
    if (packetBytes.byteLength === 0) return false
    const cid = clientId >>> 0
    this.ensureClientEntry(cid, {
      stream: null,
      address: '127.0.0.1',
      defaultCharName: 'Hero',
      defaultCharClass: 1,
      wireFormat: 'compressed',
    })
    const opcode = packetBytes[0]!
    const queue: 0 | 1 = isSystemQueue0C2sOpcode113c(opcode) ? 0 : 1
    const ok = this.packetSink.enqueueC2SPacket(cid, packetBytes, queue)
    if (ok && queue === 0 && this.autoProcessSystemPackets) {
      this.pumpSystemQueue0()
      this.flushAllClientQueuesToSink()
      this.drainSinkToConsumers()
    }
    return ok
  }

  /**
   * Pump all pending `D2Net` Queue `0` (`#10035`) and Queue `1` (`#10016`) C2S packets into
   * `SparseMemory113c` (`D2Game.#10040` `0x6FC4E460`) without advancing `dwGameFrame`.
   */
  pumpInboundQueues(): number {
    let processed = 0
    processed += this.pumpSystemQueue0()
    processed += this.pumpGameplayQueue1()
    this.flushAllClientQueuesToSink()
    this.drainSinkToConsumers()
    return processed
  }

  /**
   * Step exactly one deterministic 25fps (`40ms`) 1.13c server frame:
   * 1. Dequeue & dispatch all inbound C2S packets (`Queue 0` `#10035` + `Queue 1` `#10016`)
   *    while `dwGameFrame` is at `N` (`D2Game.#10040` `0x6FC4E460`).
   * 2. Advance `GAME_UpdateGameFrame113c` (`0x6FC4E050`) to `N + 1` (`+40ms` virtual clock).
   * 3. Emit post-step movement/vital sync packets (`0x0D`, `0x96`, `0x95`) and drain `D2Net.#10002`
   *    outbox to uncompressed and `ByteStream` (`Fog.#10223`) consumers.
   */
  stepFrame(): number {
    this.pumpSystemQueue0()
    this.pumpGameplayQueue1()

    const preStateByClient = new Map<
      number,
      { mode: number; x: number; y: number; hp: number; mana: number; stamina: number }
    >()
    for (const entry of this.clients.values()) {
      if (entry.closed || entry.pPlayer === 0 || entry.pClient === 0) continue
      if (this.m.u32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) !== 4) continue
      const pPlr = entry.pPlayer
      preStateByClient.set(entry.clientId, {
        mode: this.m.get(pPlr, D2UnitStrc.dwAnimMode) >>> 0,
        x: UNITS_GetX113c(this.m, pPlr) & 0xffff,
        y: UNITS_GetY113c(this.m, pPlr) & 0xffff,
        hp: (STATLIST_GetUnitStat113c(this.m, pPlr, STAT_HITPOINTS, 0) >> 8) & 0x7fff,
        mana: (STATLIST_GetUnitStat113c(this.m, pPlr, STAT_MANA, 0) >> 8) & 0x7fff,
        stamina: (STATLIST_GetUnitStat113c(this.m, pPlr, STAT_STAMINA, 0) >> 8) & 0x7fff,
      })
    }

    stepFallenSliceFrame113c(this.sliceWorld, [])
    this.virtualTickMs = (this.virtualTickMs + D2GS_KERNEL_FRAME_MS_113C) >>> 0

    for (const entry of this.clients.values()) {
      const pre = preStateByClient.get(entry.clientId)
      if (pre === undefined || entry.pPlayer === 0 || entry.pClient === 0) continue
      const pPlr = entry.pPlayer
      const curMode = this.m.get(pPlr, D2UnitStrc.dwAnimMode) >>> 0
      const curX = UNITS_GetX113c(this.m, pPlr) & 0xffff
      const curY = UNITS_GetY113c(this.m, pPlr) & 0xffff
      const curHp = (STATLIST_GetUnitStat113c(this.m, pPlr, STAT_HITPOINTS, 0) >> 8) & 0x7fff
      const maxHp = Math.max(1, STATLIST_GetUnitStat113c(this.m, pPlr, STAT_MAXHP, 0) >> 8)
      const curMana = (STATLIST_GetUnitStat113c(this.m, pPlr, STAT_MANA, 0) >> 8) & 0x7fff
      const curStamina = (STATLIST_GetUnitStat113c(this.m, pPlr, STAT_STAMINA, 0) >> 8) & 0x7fff

      const wasMoving =
        pre.mode === PLRMODE_WALK || pre.mode === PLRMODE_RUN || pre.mode === PLRMODE_TOWN_WALK
      const isNeutral = curMode === PLRMODE_NEUTRAL || curMode === PLRMODE_TOWN_NEUTRAL
      if (wasMoving && isNeutral) {
        const lifePct = Math.min(100, Math.max(0, Math.trunc((curHp * 100) / maxHp)))
        for (const recipient of this.clients.values()) {
          if (recipient.closed || recipient.pClient === 0) continue
          if (this.m.u32((recipient.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) !== 4) {
            continue
          }
          D2GAME_PACKET_SendUnitStop113c(
            this.m,
            recipient.pClient,
            entry.playerUnitId,
            curX,
            curY,
            lifePct,
            this.gapBCallees,
          )
        }
        NET_SendPacket96_WalkVerify_6FCAB750_113c(
          this.m,
          entry.pClient,
          curStamina,
          curX,
          curY,
          (curX - pre.x) & 0xff,
          (curY - pre.y) & 0xff,
        )
      } else if (curHp !== pre.hp || curMana !== pre.mana || curStamina !== pre.stamina) {
        NET_SendPacket95_LifeManaStamina_6FCAB7F0_113c(
          this.m,
          entry.pClient,
          curHp,
          curMana,
          curStamina,
          curX,
          curY,
          (curX - pre.x) & 0xff,
          (curY - pre.y) & 0xff,
        )
      }
    }

    this.flushAllClientQueuesToSink()
    this.drainSinkToConsumers()
    return this.frame
  }

  /**
   * Advance deterministic simulation time by `deltaMs` milliseconds, stepping `floor(accum / 40)`
   * 25fps frames (`D2GS_KERNEL_FRAME_MS_113C = 40`). Returns the number of frames stepped.
   */
  advanceTimeMs(deltaMs: number): number {
    if (deltaMs <= 0) return 0
    this.accumTimeMs += deltaMs
    let stepped = 0
    while (this.accumTimeMs >= D2GS_KERNEL_FRAME_MS_113C) {
      this.accumTimeMs -= D2GS_KERNEL_FRAME_MS_113C
      this.stepFrame()
      stepped++
    }
    return stepped
  }

  /**
   * Spawn a 1.13c monster unit in the active room (`SparseMemory113c`) and broadcast `0xAC AssignNpc`
   * via `D2GAME_PACKET_SendMonsterAssign113c` (`0x6FCACA20`) to all in-game clients.
   */
  spawnMonsterInRoom(opts: SpawnBridgeMonsterOptions113c): {
    readonly pMonster: number
    readonly unitId: number
  } {
    const unitId = opts.unitId !== undefined ? opts.unitId >>> 0 : this.allocUnitId()
    const animMode = opts.animMode !== undefined ? opts.animMode >>> 0 : 1
    const maxHp = opts.maxHp !== undefined ? opts.maxHp : 128
    const hp = opts.hp !== undefined ? opts.hp : maxHp

    const pMonster = UNITS_Create113c(this.m, UNIT_MONSTER, opts.classId >>> 0, unitId, this.pGame)
    this.m.set(pMonster, D2UnitStrc.dwAnimMode, animMode)
    this.m.setU32((pMonster + 0x80) >>> 0, this.pGame)

    const pMonData = this.m.alloc(D2MonsterDataStrc_SIZE) >>> 0
    const pMonTxt = getMonStatsTxtPtrPure113c(this.m, opts.classId >>> 0)
    if (pMonTxt !== 0) {
      this.m.set(pMonData, D2MonsterDataStrc.pMonStatsTxt, pMonTxt >>> 0)
    }
    this.m.set(pMonster, D2UnitStrc.pUnitData, pMonData)

    this.initDynamicPathOnUnit(pMonster, opts.x, opts.y, this.defaultRoomPtr, false)
    UNITROOM_AddUnitToRoom113c(this.m, pMonster, this.defaultRoomPtr)
    this.insertUnitIntoGameHash(pMonster, UNIT_MONSTER, unitId)

    STATLIST_CreateEx113c(this.m, pMonster, 0x80000000, this.pGame)
    STATLIST_SetUnitStat113c(this.m, pMonster, STAT_MAXHP, (maxHp << 8) | 0, 0)
    STATLIST_SetUnitStat113c(this.m, pMonster, STAT_HITPOINTS, (hp << 8) | 0, 0)

    this.syncUnitIntoSliceWorld()

    for (const entry of this.clients.values()) {
      if (entry.closed || entry.pClient === 0) continue
      if (this.m.u32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) !== 4) continue
      D2GAME_PACKET_SendMonsterAssign113c(
        this.m,
        pMonster,
        entry.pClient,
        D2COMMON_SGPT_DATATABLES_VA_113C,
        this.gapBCallees,
      )
    }

    this.flushAllClientQueuesToSink()
    this.drainSinkToConsumers()
    return { pMonster, unitId }
  }

  /**
   * Spawn a 1.13c object unit (`UNIT_OBJECT = 2`) in the active room (`SparseMemory113c`) and
   * broadcast 14-byte S2C `0x51 AssignObject` to all in-game clients.
   */
  spawnObjectInRoom(opts: SpawnBridgeObjectOptions113c): {
    readonly pObject: number
    readonly unitId: number
  } {
    const UNIT_OBJECT_113C = 2
    const unitId = opts.unitId !== undefined ? opts.unitId >>> 0 : this.allocUnitId()
    const mode = opts.mode !== undefined ? opts.mode & 0xff : 0
    const flags = opts.flags !== undefined ? opts.flags & 0xff : 0

    const pObject = UNITS_Create113c(
      this.m,
      UNIT_OBJECT_113C,
      opts.classId >>> 0,
      unitId,
      this.pGame,
    )
    this.m.set(pObject, D2UnitStrc.dwAnimMode, mode)
    this.m.setU32((pObject + 0x80) >>> 0, this.pGame)

    const pStaticPath = this.m.alloc(0x20) >>> 0
    this.m.setU32(pStaticPath, this.defaultRoomPtr >>> 0)
    this.m.setU32((pStaticPath + 0x0c) >>> 0, opts.x >>> 0)
    this.m.setU32((pStaticPath + 0x10) >>> 0, opts.y >>> 0)
    this.m.set(pObject, D2UnitStrc.pPath, pStaticPath)

    const pObjData = this.m.alloc(0x38) >>> 0
    this.m.setU8((pObjData + 0x04) >>> 0, flags)
    this.m.set(pObject, D2UnitStrc.pUnitData, pObjData)

    if (this.defaultRoomPtr !== 0) {
      UNITROOM_AddUnitToRoom113c(this.m, pObject, this.defaultRoomPtr)
    }
    this.insertUnitIntoGameHash(pObject, UNIT_OBJECT_113C, unitId)
    this.syncUnitIntoSliceWorld()

    const pkt = this.encodePacket0x51AssignObject(unitId, opts.classId, opts.x, opts.y, mode, flags)
    for (const entry of this.clients.values()) {
      if (entry.closed || entry.pClient === 0) continue
      if (this.m.u32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) !== 4) continue
      this.queueBytesToClientBuffer(this.m, entry.pClient, pkt)
      if (this.getQueuedByteCount(entry.pClient) >= 0x280) {
        this.flushClientQueueToSink(entry)
      }
    }

    this.flushAllClientQueuesToSink()
    this.drainSinkToConsumers()
    return { pObject, unitId }
  }

  private encodePacket0x51AssignObject(
    unitId: number,
    classId: number,
    x: number,
    y: number,
    mode: number,
    flags: number,
  ): Uint8Array {
    const pkt = new Uint8Array(14)
    pkt[0] = 0x51
    pkt[1] = 0x02
    pkt[2] = unitId & 0xff
    pkt[3] = (unitId >>> 8) & 0xff
    pkt[4] = (unitId >>> 16) & 0xff
    pkt[5] = (unitId >>> 24) & 0xff
    pkt[6] = classId & 0xff
    pkt[7] = (classId >>> 8) & 0xff
    pkt[8] = x & 0xff
    pkt[9] = (x >>> 8) & 0xff
    pkt[10] = y & 0xff
    pkt[11] = (y >>> 8) & 0xff
    pkt[12] = mode & 0xff
    pkt[13] = flags & 0xff
    return pkt
  }

  /**
   * Mutate a player's stat in `SparseMemory113c` via `STATLIST_SetUnitStat113c` and emit the
   * exact 1.13c `0x1D` / `0x1E` / `0x1F` attribute packet via `D2GAME_PACKET_SendStatByteWordDword113c` (`0x6FCABD00`).
   */
  setPlayerStatAndSync(clientId: number, statId: number, value: number, layer = 0): boolean {
    const entry = this.clients.get(clientId >>> 0)
    if (entry === undefined || entry.closed || entry.pPlayer === 0 || entry.pClient === 0) {
      return false
    }
    STATLIST_SetUnitStat113c(this.m, entry.pPlayer, statId, value, layer)
    D2GAME_PACKET_SendStatByteWordDword113c(
      this.m,
      entry.pClient,
      statId,
      value,
      this.gapBCallees,
    )
    this.flushAllClientQueuesToSink()
    this.drainSinkToConsumers()
    return true
  }

  /**
   * Toggle a state on `pUnit` in `SparseMemory113c` (`STATES_ToggleState113c`) and broadcast
   * S2C `0xA7` (`DelayedState`), `0xA8` (`SetState` with `ItemStatCost` bit widths), or `0xA9` (`EndState`).
   */
  setUnitStateAndSync(
    pUnit: number,
    stateId: number,
    active: boolean,
    stateStats?: readonly ItemStat[],
  ): void {
    const u = pUnit >>> 0
    if (u === 0) return
    const unitType = this.m.get(u, D2UnitStrc.dwUnitType) & 0xff
    const unitId = this.m.get(u, D2UnitStrc.dwUnitId) >>> 0
    const st = stateId & 0xff

    STATES_ToggleState113c(this.m, u, st, active ? 1 : 0)

    if (active && stateStats !== undefined && stateStats.length > 0) {
      const pSubList = ITEMMODS_GetOrCreateStatList113c(this.m, 0, u, st, 0x40)
      if (pSubList !== 0) {
        for (let i = 0; i < stateStats.length; i++) {
          const s = stateStats[i]!
          STATLIST_SetUnitStat113c(
            this.m,
            u,
            s.statId,
            s.value,
            s.param !== undefined ? s.param : 0,
          )
        }
      }
      const pkt = this.encodePacket0xA8SetState(unitType, unitId, st, stateStats)
      for (const entry of this.clients.values()) {
        if (entry.closed || entry.pClient === 0) continue
        if (this.m.u32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) !== 4) continue
        this.queueBytesToClientBuffer(this.m, entry.pClient, pkt)
      }
    } else if (active) {
      for (const entry of this.clients.values()) {
        if (entry.closed || entry.pClient === 0) continue
        if (this.m.u32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) !== 4) continue
        const pkt = new Uint8Array(7)
        pkt[0] = 0xa7
        pkt[1] = unitType
        pkt[2] = unitId & 0xff
        pkt[3] = (unitId >>> 8) & 0xff
        pkt[4] = (unitId >>> 16) & 0xff
        pkt[5] = (unitId >>> 24) & 0xff
        pkt[6] = st
        this.queueBytesToClientBuffer(this.m, entry.pClient, pkt)
      }
    } else {
      for (const entry of this.clients.values()) {
        if (entry.closed || entry.pClient === 0) continue
        if (this.m.u32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) !== 4) continue
        const pkt = new Uint8Array(7)
        pkt[0] = 0xa9
        pkt[1] = unitType
        pkt[2] = unitId & 0xff
        pkt[3] = (unitId >>> 8) & 0xff
        pkt[4] = (unitId >>> 16) & 0xff
        pkt[5] = (unitId >>> 24) & 0xff
        pkt[6] = st
        this.queueBytesToClientBuffer(this.m, entry.pClient, pkt)
      }
    }

    this.flushAllClientQueuesToSink()
    this.drainSinkToConsumers()
  }

  /** Emit 6-byte S2C `0x07 RoomReveal` (`MapAdd`) via `NET_SendPacket07_RoomTileCoords_6FCABF50_113c`. */
  revealRoomToClient(clientId: number, tileX: number, tileY: number, areaId = this.areaId): boolean {
    const entry = this.clients.get(clientId >>> 0)
    if (entry === undefined || entry.closed || entry.pClient === 0) return false
    NET_SendPacket07_RoomTileCoords_6FCABF50_113c(this.m, tileX, tileY, entry.pClient, areaId)
    this.flushAllClientQueuesToSink()
    this.drainSinkToConsumers()
    return true
  }

  /** Emit 6-byte S2C `0x08 RoomHide` (`MapRemove`) to `clientId`. */
  hideRoomFromClient(clientId: number, tileX: number, tileY: number, areaId = this.areaId): boolean {
    const entry = this.clients.get(clientId >>> 0)
    if (entry === undefined || entry.closed || entry.pClient === 0) return false
    const pkt = new Uint8Array(6)
    pkt[0] = 0x08
    pkt[1] = tileX & 0xff
    pkt[2] = (tileX >>> 8) & 0xff
    pkt[3] = tileY & 0xff
    pkt[4] = (tileY >>> 8) & 0xff
    pkt[5] = areaId & 0xff
    this.queueBytesToClientBuffer(this.m, entry.pClient, pkt)
    this.flushAllClientQueuesToSink()
    this.drainSinkToConsumers()
    return true
  }

  private encodePacket0xA8SetState(
    unitType: number,
    unitId: number,
    stateId: number,
    stats: readonly ItemStat[],
  ): Uint8Array {
    const bw = new BitWriter()
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i]!
      const meta = this.tables.getStatCost(s.statId)
      if (!meta || meta.sendBits <= 0) continue
      bw.writeBits(s.statId & 0x1ff, 9)
      if (meta.sendParamBits > 0) {
        bw.writeBits((s.param !== undefined ? s.param : 0) >>> 0, meta.sendParamBits)
      }
      bw.writeBits(s.value >>> 0, meta.sendBits)
    }
    bw.writeBits(0x1ff, 9)
    const statPayload = bw.toUint8Array()
    const totalLen = 8 + statPayload.byteLength
    const pkt = new Uint8Array(totalLen)
    pkt[0] = 0xa8
    pkt[1] = unitType & 0xff
    pkt[2] = unitId & 0xff
    pkt[3] = (unitId >>> 8) & 0xff
    pkt[4] = (unitId >>> 16) & 0xff
    pkt[5] = (unitId >>> 24) & 0xff
    pkt[6] = totalLen & 0xff
    pkt[7] = stateId & 0xff
    pkt.set(statPayload, 8)
    return pkt
  }

  private ensureClientEntry(
    clientId: number,
    cfg: {
      readonly stream: ByteStream | null
      readonly address: string
      readonly defaultCharName: string
      readonly defaultCharClass: CharClassId
      readonly wireFormat: 'compressed' | 'uncompressed'
    },
  ): InternalClientEntry113c {
    const existing = this.clients.get(clientId)
    if (existing !== undefined) return existing

    this.packetSink.registerClient(clientId, cfg.address, this.wGameId, 1)
    const pClient = this.allocD2ClientStrc(clientId, cfg.defaultCharName, cfg.defaultCharClass)
    const entry: InternalClientEntry113c = {
      clientId,
      pClient,
      pPlayer: 0,
      playerUnitId: 0,
      charName: cfg.defaultCharName,
      charClass: cfg.defaultCharClass,
      stream: cfg.stream,
      framer: new D2gsC2sFramer(),
      wireFormat: cfg.wireFormat,
      unsubs: [],
      closed: false,
    }
    this.clients.set(clientId, entry)
    return entry
  }

  private createClientHandle(entry: InternalClientEntry113c): D2gsBridgeClientHandle113c {
    return {
      clientId: entry.clientId,
      pClient: entry.pClient,
      stream: entry.stream,
      wireFormat: entry.wireFormat,
      getPlayerPtr: () => entry.pPlayer >>> 0,
      getPlayerUnitId: () => entry.playerUnitId >>> 0,
      getClientState: () =>
        entry.pClient !== 0
          ? this.m.u32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) >>> 0
          : 0,
      close: () => {
        if (entry.closed) return
        entry.closed = true
        for (let i = 0; i < entry.unsubs.length; i++) {
          entry.unsubs[i]!()
        }
        entry.unsubs.length = 0
        this.packetSink.dispatchIat(D2GAME_NET_IAT_VA_113C.disconnectClient_10000, this.m, [
          entry.clientId,
        ])
        if (entry.stream !== null) {
          entry.stream.close({ kind: 'local' })
        }
      },
    }
  }

  private allocD2ClientStrc(
    clientId: number,
    charName: string,
    charClass: CharClassId,
  ): number {
    const m = this.m
    const pClient = m.alloc(D2CLIENT_STRC_SIZE_113C) >>> 0
    m.setU32((pClient + D2ClientStrcOffsets.dwClientId) >>> 0, clientId >>> 0)
    m.setU32((pClient + D2ClientStrcOffsets.dwClientState) >>> 0, 0)
    m.setU8((pClient + 0x0c) >>> 0, charClass & 0xff)
    writeFixedAscii16(m, (pClient + 0x0d) >>> 0, charName)
    m.setU32((pClient + 0x19c) >>> 0, this.virtualTickMs >>> 0)
    m.setU32((pClient + 0x1a8) >>> 0, this.pGame)
    m.setU8((pClient + 0x1ac) >>> 0, this.actIdx & 0xff)

    m.setU32((pClient + 0x1b8) >>> 0, 0)
    m.setU32((pClient + 0x1bc) >>> 0, 0)
    m.setU32((pClient + 0x1c0) >>> 0, 0)

    m.setU32((pClient + 0x3d4) >>> 0, 0x01)
    m.setU32((pClient + 0x3d8) >>> 0, this.virtualTickMs >>> 0)

    const prevHead = m.u32((this.pGame + 0x88) >>> 0) >>> 0
    m.setU32((pClient + 0x4a8) >>> 0, prevHead)
    m.setU32((this.pGame + 0x88) >>> 0, pClient)
    return pClient
  }

  private allocUnitId(): number {
    return this.nextUnitId++ >>> 0
  }

  private insertUnitIntoGameHash(pUnit: number, unitType: number, unitId: number): void {
    const bucketIdx = (((unitType & 7) << 7) + (unitId & 0x7f)) | 0
    const prev = this.m.get(this.pGame, D2GameStrc.pUnitHash, bucketIdx) >>> 0
    this.m.set(pUnit, D2UnitStrc.pGameHashNext, prev)
    this.m.set(this.pGame, D2GameStrc.pUnitHash, pUnit >>> 0, bucketIdx)
  }

  private queueBytesToClientBuffer(m: Memory113c, pClient: number, bytes: Uint8Array): void {
    if (pClient === 0 || bytes.byteLength === 0) return
    const pBuf =
      bytes.byteLength <= 0x140
        ? this.pSmallScratch
        : (m.alloc(bytes.byteLength) >>> 0)
    for (let i = 0; i < bytes.byteLength; i++) {
      m.setU8((pBuf + i) >>> 0, bytes[i]!)
    }
    NET_QueuePacketToClientBuffer113c(m, pClient, 1, pBuf, bytes.byteLength)
  }

  /**
   * `D2Game.#10040` (`0x6FC4E460..0x6FC4E483`) -> `0x6FCEAF30`:
   * Dequeues Queue `0` (`#10035`) system/handshake C2S packets (`0x67..0x70`) via
   * `IAT 0x6FD18B58` (`Fog.#10156`) into `SparseMemory113c`.
   */
  private pumpSystemQueue0(): number {
    let count = 0
    while (true) {
      const pktLen =
        this.packetSink.dispatchIat(D2GAME_NET_IAT_VA_113C.dequeueQ0_10035, this.m, [
          this.pRecvScratch,
          0x200,
        ]) | 0
      if (pktLen < 0) break
      const clientId = this.m.u32(this.pRecvScratch) >>> 0
      const pPacket = (this.pRecvScratch + 4) >>> 0
      this.handleSystemQueue0Packet(clientId, pPacket, pktLen)
      count++
    }
    return count
  }

  /**
   * `D2Game.#10040` (`0x6FC4E485..0x6FC4E4A3`) -> `0x6FCEAE80` -> `0x6FCEC550`:
   * Dequeues Queue `1` (`#10016`) gameplay C2S packets (`0x01..0x66`) via
   * `IAT 0x6FD18B54` (`Fog.#10156`) into `SparseMemory113c` and dispatches via `C2S_DispatchPacketMem113c`.
   */
  private pumpGameplayQueue1(): number {
    let count = 0
    while (true) {
      const pktLen =
        this.packetSink.dispatchIat(D2GAME_NET_IAT_VA_113C.dequeueQ1_10016, this.m, [
          this.pRecvScratch,
          0x200,
        ]) | 0
      if (pktLen < 0) break
      const clientId = this.m.u32(this.pRecvScratch) >>> 0
      const pPacket = (this.pRecvScratch + 4) >>> 0
      this.handleGameplayQueue1Packet(clientId, pPacket, pktLen)
      count++
    }
    return count
  }

  private handleSystemQueue0Packet(clientId: number, pPacket: number, pktLen: number): void {
    if (pktLen <= 0) return
    const entry = this.clients.get(clientId)
    if (entry === undefined || entry.closed) return
    const opcode = this.m.u8(pPacket)

    switch (opcode) {
      case 0x68: {
        // `0x68 GameLogon` (37B, `0x6FCEAFC2` -> `0x6FC4A740` -> `0x6FC4AC60`)
        if (pktLen < 37) return
        const rawClass = this.m.u8((pPacket + 7) >>> 0)
        const charClass = (rawClass <= 6 ? rawClass : 1) as CharClassId
        const charName = readFixedAscii16(this.m, (pPacket + 21) >>> 0) || entry.charName
        entry.charClass = charClass
        entry.charName = charName
        this.m.setU8((entry.pClient + 0x0c) >>> 0, charClass)
        writeFixedAscii16(this.m, (entry.pClient + 0x0d) >>> 0, charName)
        this.m.setU32((entry.pClient + 0x19c) >>> 0, this.virtualTickMs >>> 0)

        this.packetSink.dispatchIat(D2GAME_NET_IAT_VA_113C.setClientGameTag_10021, this.m, [
          clientId,
          this.wGameId,
        ])

        // `0x6FC4AC60`: emits 8B `0x01 GameFlags` + 1B `0x00 GameLoading` and sets `dwClientState = 1`
        CLIENTS_SendHandshakeAndSetInitState1_6FC4AC60_113c(this.m, entry.pClient, this.pGame)

        // Transition `dwClientState` `1 -> 2` and emit 1B `0x02 GameLogonSuccess`
        this.queueBytesToClientBuffer(this.m, entry.pClient, new Uint8Array([0x02]))
        this.m.setU32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0, 2)
        break
      }

      case 0x6b: {
        // `0x6B EnterGame` (1B, `0x6FCEB0BA` -> `0x6FC4E360` + `0x6FC4D9B0` join state 3 -> 4)
        const curState = this.m.u32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0)
        if (curState === 0) {
          CLIENTS_SendHandshakeAndSetInitState1_6FC4AC60_113c(this.m, entry.pClient, this.pGame)
          this.queueBytesToClientBuffer(this.m, entry.pClient, new Uint8Array([0x02]))
        }
        this.m.setU32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0, 3)
        this.enterGameAndSyncWorld(entry)
        break
      }

      case 0x6d: {
        // `0x6D Ping` (9B: `[0x6D, u32 tickCount, u32 delay]`, `0x6FCEAFAA` -> `0x6FC6A780`)
        if (pktLen < 9) return
        const clientTick = this.m.u32((pPacket + 1) >>> 0) >>> 0
        const delay = this.m.u32((pPacket + 5) >>> 0) >>> 0
        const sample = (this.virtualTickMs - clientTick - delay) | 0
        const pingIdx = this.m.u32((entry.pClient + 0x500) >>> 0) >>> 0
        this.m.setU32((entry.pClient + 0x4b4 + (pingIdx & 0x0f) * 4) >>> 0, sample >>> 0)
        this.m.setU32((entry.pClient + 0x500) >>> 0, (pingIdx + 1) >>> 0)
        this.m.setU32((entry.pClient + 0x3d8) >>> 0, this.virtualTickMs >>> 0)

        const pong = new Uint8Array(33)
        pong[0] = 0x8f
        this.queueBytesToClientBuffer(this.m, entry.pClient, pong)
        break
      }

      case 0x69: {
        // `0x69 LeaveGame` (1B, `0x6FCEB08A` -> `0x6FC4DC70` -> `0x6FCAA4A0` `0x06 GameLogoutSuccess` + `#10000`)
        this.flushClientQueueToSink(entry)
        this.m.setU8(this.pSendScratch, 0x06)
        this.packetSink.dispatchIat(D2GAME_NET_IAT_VA_113C.sendPacket_10002, this.m, [
          1,
          clientId,
          this.pSendScratch,
          1,
        ])
        this.drainSinkToConsumers()

        if (entry.pPlayer !== 0) {
          const pRoom = UNITS_GetRoom113c(this.m, entry.pPlayer) >>> 0
          if (pRoom !== 0) {
            UNITROOM_RemoveUnitFromRoom113c(this.m, entry.pPlayer)
            DUNGEON_RemoveClientFromRoom113c(this.m, pRoom, entry.pClient)
          }
        }
        this.m.setU32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0, 5)
        this.packetSink.dispatchIat(D2GAME_NET_IAT_VA_113C.disconnectClient_10000, this.m, [
          clientId,
        ])
        break
      }

      default:
        break
    }
  }

  private enterGameAndSyncWorld(entry: InternalClientEntry113c): void {
    const m = this.m
    if (entry.pPlayer === 0) {
      let existingPlayer = 0
      const base = (this.pGame + 0x1120) >>> 0
      for (let b = 0; b < 128 && existingPlayer === 0; b++) {
        const candidate = m.u32((base + b * 4) >>> 0) >>> 0
        if (candidate !== 0 && this.clients.size === 1) {
          const pPlrData = m.get(candidate, D2UnitStrc.pUnitData) >>> 0
          const boundCli = pPlrData !== 0 ? (m.u32((pPlrData + 0x9c) >>> 0) >>> 0) : 0
          if (boundCli === 0 || boundCli === entry.pClient) {
            existingPlayer = candidate
          }
        }
      }

      if (existingPlayer !== 0) {
        entry.pPlayer = existingPlayer
        entry.playerUnitId = m.get(existingPlayer, D2UnitStrc.dwUnitId) >>> 0
        const pPlrData = m.get(existingPlayer, D2UnitStrc.pUnitData) >>> 0
        if (pPlrData !== 0) {
          m.setU32((pPlrData + 0x9c) >>> 0, entry.pClient)
        }
      } else {
        entry.pPlayer = this.spawnPlayerUnitForClient(entry)
      }
    }

    const pPlayer = entry.pPlayer >>> 0
    const pRoom = (UNITS_GetRoom113c(m, pPlayer) || this.defaultRoomPtr) >>> 0

    m.setU32((entry.pClient + 0x16c) >>> 0, UNIT_PLAYER)
    m.setU32((entry.pClient + 0x170) >>> 0, entry.playerUnitId >>> 0)
    m.setU32((entry.pClient + D2ClientStrcOffsets.pPlayer) >>> 0, pPlayer)
    m.setU32((entry.pClient + 0x1b4) >>> 0, pRoom)

    if (pRoom !== 0) {
      DUNGEON_AddClientToRoom113c(m, pRoom, entry.pClient)
    }

    this.sliceClientById.set(entry.clientId, pPlayer)
    this.syncUnitIntoSliceWorld()

    const flushIfNearCapacity = (): void => {
      if (this.getQueuedByteCount(entry.pClient) >= 0x280) {
        this.flushClientQueueToSink(entry)
      }
    }

    // 1. `0x0B GameHandshake` (6B, `0x6FCAC060` -> `D2Client.dll 0x6FB5D6E0` assigns local `selfId`)
    const pkt0b = new Uint8Array(6)
    pkt0b[0] = 0x0b
    pkt0b[1] = UNIT_PLAYER
    new DataView(pkt0b.buffer).setUint32(2, entry.playerUnitId >>> 0, true)
    this.queueBytesToClientBuffer(m, entry.pClient, pkt0b)

    // 2. `0x59 AssignPlayer` (26B) + `0x75 PlayerPartyInfo` (13B) (`0x6FCAD710`)
    // Must precede `0x53 EnvironmentSync` because `D2Client.dll 0x6FB5E9C0` dereferences `player->pAct`.
    const posX = UNITS_GetX113c(m, pPlayer) & 0xffff
    const posY = UNITS_GetY113c(m, pPlayer) & 0xffff
    NET_SendPacket59_AssignPlayerAndPartyRoster_6FCAD710_113c(
      m,
      entry.pClient,
      entry.charClass,
      entry.playerUnitId,
      (entry.pClient + 0x0d) >>> 0,
      posX,
      posY,
    )

    // 2. `0x03 LoadAct` (12B) + `0x53 EnvironmentSync` (10B) (`0x6FCBD610`)
    CLIENT_SendLoadActAndEnvStatePackets_6FCBD610_113c(m, entry.pClient, this.pGame)

    // 3. `0x07 RoomReveal` (`MapAdd`, 6B) (`0x6FCABF50`)
    const seenRooms = new Set<string>()
    if (pRoom !== 0) {
      const tileX = m.get(pRoom, D2ActiveRoomStrc.nTileX) & 0xffff
      const tileY = m.get(pRoom, D2ActiveRoomStrc.nTileY) & 0xffff
      const levelId = DUNGEON_GetLevelIdFromRoom113c(m, pRoom) || this.areaId
      seenRooms.add(`${levelId}:${tileX}:${tileY}`)
      NET_SendPacket07_RoomTileCoords_6FCABF50_113c(m, tileX, tileY, entry.pClient, levelId)
    }
    for (let i = 0; i < this.extraRevealedRooms.length; i++) {
      const rm = this.extraRevealedRooms[i]!
      const key = `${rm.areaId}:${rm.tileX & 0xffff}:${rm.tileY & 0xffff}`
      if (seenRooms.has(key)) continue
      seenRooms.add(key)
      NET_SendPacket07_RoomTileCoords_6FCABF50_113c(
        m,
        rm.tileX & 0xffff,
        rm.tileY & 0xffff,
        entry.pClient,
        rm.areaId & 0xff,
      )
      flushIfNearCapacity()
    }

    // 4. `0x15 ReassignPlayer` (11B, `bFlash = 1`) (`0x6FCEBB10`)
    NET_SendReassignUnitPacket15_113c(m, pPlayer, entry.pClient, 1)

    // 5. Initial skill assignment (`0x23 AssignSkill`)
    NET_SendPacket0x23_AssignSkill113c(
      m,
      UNIT_PLAYER,
      entry.playerUnitId,
      entry.pClient,
      1,
      this.initialLeftSkill,
      -1,
      {
        queuePacket: (mem, cli, pktPtr, pktSize) => {
          NET_QueuePacketToClientBuffer113c(mem, cli, 1, pktPtr, pktSize)
        },
      },
    )
    NET_SendPacket0x23_AssignSkill113c(
      m,
      UNIT_PLAYER,
      entry.playerUnitId,
      entry.pClient,
      0,
      this.initialRightSkill,
      -1,
      {
        queuePacket: (mem, cli, pktPtr, pktSize) => {
          NET_QueuePacketToClientBuffer113c(mem, cli, 1, pktPtr, pktSize)
        },
      },
    )

    // 6. Base attribute bootstrap (`0x1D` / `0x1E` / `0x1F`) (`0x6FCABD00`)
    for (let i = 0; i < INITIAL_SYNC_STAT_IDS_113C.length; i++) {
      const statId = INITIAL_SYNC_STAT_IDS_113C[i]!
      const val = STATLIST_GetUnitStat113c(m, pPlayer, statId, 0) | 0
      D2GAME_PACKET_SendStatByteWordDword113c(m, entry.pClient, statId, val, this.gapBCallees)
    }

    // 7. Active unit states (`0xA7` / `0xA8` / `0xAA`) on player (`0x6FC9A940`)
    UNIT_SendAllStatesBitstreamToClient113c(m, pPlayer, entry.pClient)
    flushIfNearCapacity()

    // 8. Active room monsters (`0xAC AssignNpc`, `0x6FCACA20`) & objects (`0x51 AssignObject`)
    if (pRoom !== 0) {
      let pUnit = m.get(pRoom, D2ActiveRoomStrc.pUnitFirst) >>> 0
      let guard = 0
      while (pUnit !== 0 && guard++ < 2048) {
        const uType = m.get(pUnit, D2UnitStrc.dwUnitType) >>> 0
        if (uType === UNIT_MONSTER) {
          D2GAME_PACKET_SendMonsterAssign113c(
            m,
            pUnit,
            entry.pClient,
            D2COMMON_SGPT_DATATABLES_VA_113C,
            this.gapBCallees,
          )
          flushIfNearCapacity()
        } else if (uType === 2) {
          const objId = m.get(pUnit, D2UnitStrc.dwUnitId) >>> 0
          const objClass = m.get(pUnit, D2UnitStrc.dwClassId) & 0xffff
          const objX = UNITS_GetX113c(m, pUnit) & 0xffff
          const objY = UNITS_GetY113c(m, pUnit) & 0xffff
          const objMode = m.get(pUnit, D2UnitStrc.dwAnimMode) & 0xff
          const pObjData = m.get(pUnit, D2UnitStrc.pUnitData) >>> 0
          const objFlags = pObjData !== 0 ? m.u8((pObjData + 0x04) >>> 0) : 0
          this.queueBytesToClientBuffer(
            m,
            entry.pClient,
            this.encodePacket0x51AssignObject(objId, objClass, objX, objY, objMode, objFlags),
          )
          flushIfNearCapacity()
        }
        pUnit = m.get(pUnit, D2UnitStrc.pRoomUnitNext) >>> 0
      }
    }

    // 9. `0x04 LoadDone` (1B) + `dwClientState = 4` (`0x6FC4DA98..0x6FC4DAAC`)
    this.queueBytesToClientBuffer(m, entry.pClient, new Uint8Array([0x04]))
    m.setU32((entry.pClient + D2ClientStrcOffsets.dwClientState) >>> 0, 4)
  }

  private initDynamicPathOnUnit(
    pUnit: number,
    x: number,
    y: number,
    pRoom: number,
    isPlayer: boolean,
  ): number {
    const m = this.m
    const pPath = m.alloc(D2DynamicPathStrc_SIZE) >>> 0
    m.set(pUnit, D2UnitStrc.pPath, pPath)
    m.set(pPath, D2DynamicPathStrc.wOffsetX, 0x8000)
    m.set(pPath, D2DynamicPathStrc.wPosX, x & 0xffff)
    m.set(pPath, D2DynamicPathStrc.wOffsetY, 0x8000)
    m.set(pPath, D2DynamicPathStrc.wPosY, y & 0xffff)
    m.set(pPath, D2DynamicPathStrc.wTargetX, x & 0xffff)
    m.set(pPath, D2DynamicPathStrc.wTargetY, y & 0xffff)
    m.set(pPath, D2DynamicPathStrc.pRoom, pRoom >>> 0)
    m.set(pPath, D2DynamicPathStrc.pUnit, pUnit >>> 0)
    m.set(pPath, D2DynamicPathStrc.dwPathType, 2)
    m.set(pPath, D2DynamicPathStrc.dwUnitSize, 2)
    m.set(pPath, D2DynamicPathStrc.dwCollisionPattern, 1)
    m.set(pPath, D2DynamicPathStrc.nFootprintCollisionMask, isPlayer ? 0x80 : 0x100)
    m.set(pPath, D2DynamicPathStrc.nMoveTestCollisionMask, isPlayer ? 0x1c09 : 0x3c01)
    return pPath
  }

  private spawnPlayerUnitForClient(entry: InternalClientEntry113c): number {
    const m = this.m
    const unitId = this.allocUnitId()
    entry.playerUnitId = unitId

    const pPlayer = UNITS_Create113c(m, UNIT_PLAYER, entry.charClass, unitId, this.pGame)
    m.set(pPlayer, D2UnitStrc.dwAnimMode, PLRMODE_NEUTRAL)
    m.setU32((pPlayer + 0x80) >>> 0, this.pGame)

    const pPlayerData = m.alloc(D2PlayerDataStrc_SIZE) >>> 0
    writeFixedAscii16(m, pPlayerData, entry.charName)
    m.setU32((pPlayerData + 0x9c) >>> 0, entry.pClient)
    m.set(pPlayer, D2UnitStrc.pUnitData, pPlayerData)

    const pInventory = m.alloc(D2InventoryStrc_SIZE) >>> 0
    m.set(pInventory, D2InventoryStrc.dwSignature, 0x01020304)
    m.set(pInventory, D2InventoryStrc.pOwner, pPlayer)
    m.set(pInventory, D2InventoryStrc.dwWeaponId, 0xffffffff)
    m.set(pPlayer, D2UnitStrc.pInventory, pInventory)

    this.initDynamicPathOnUnit(pPlayer, this.spawnX, this.spawnY, this.defaultRoomPtr, true)
    if (this.defaultRoomPtr !== 0) {
      UNITROOM_AddUnitToRoom113c(m, pPlayer, this.defaultRoomPtr)
    }
    this.insertUnitIntoGameHash(pPlayer, UNIT_PLAYER, unitId)

    STATLIST_CreateEx113c(m, pPlayer, 0x80000000, this.pGame)
    const charStats = getCharStatsPure113c(entry.charClass)
    const str = charStats.str !== undefined ? charStats.str : 20
    const dex = charStats.dex !== undefined ? charStats.dex : 20
    const vit = charStats.vit !== undefined ? charStats.vit : 20
    const ene = charStats.int !== undefined ? charStats.int : 25
    const hpAdd = charStats.hpAdd !== undefined ? charStats.hpAdd : 20
    const stamBase = charStats.stamina !== undefined ? charStats.stamina : 84
    const baseHp = (vit + hpAdd) << 8
    const baseMana = ene << 8
    const baseStam = stamBase << 8

    STATLIST_SetUnitStat113c(m, pPlayer, STAT_STRENGTH, str, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_ENERGY, ene, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_DEXTERITY, dex, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_VITALITY, vit, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_STATPTS, 5, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_NEWSKILLS, 1, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_HITPOINTS, baseHp, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_MAXHP, baseHp, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_MANA, baseMana, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_MAXMANA, baseMana, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_STAMINA, baseStam, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_MAXSTAMINA, baseStam, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_LEVEL, 1, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_EXPERIENCE, 0, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_GOLD, 0, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_GOLDBANK, 0, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_VELOCITYPERCENT, 100, 0)
    STATLIST_SetUnitStat113c(m, pPlayer, STAT_ATTACKRATE, 100, 0)
    if (this.initialPlayerStats !== undefined) {
      for (const [rawKey, val] of Object.entries(this.initialPlayerStats)) {
        const statId = Number(rawKey)
        if (Number.isInteger(statId) && statId >= 0) {
          STATLIST_SetUnitStat113c(m, pPlayer, statId, val | 0, 0)
        }
      }
    }

    const pSkills = SKILLS_AllocSkillList113c(m, 0) >>> 0
    m.set(pPlayer, D2UnitStrc.pSkills, pSkills)
    SKILLS_SetSkillLevelOnUnit113c(m, pPlayer, 0, 1, 1, 0, 0)
    if (this.initialLeftSkill > 0) {
      SKILLS_SetSkillLevelOnUnit113c(m, pPlayer, this.initialLeftSkill, 1, 1, 0, 0)
    }
    if (this.initialRightSkill > 0 && this.initialRightSkill !== this.initialLeftSkill) {
      SKILLS_SetSkillLevelOnUnit113c(m, pPlayer, this.initialRightSkill, 1, 1, 0, 0)
    }
    const pLeftSkill = SKILLS_GetSkillById113c(m, pPlayer, this.initialLeftSkill, -1) >>> 0
    const pRightSkill = SKILLS_GetSkillById113c(m, pPlayer, this.initialRightSkill, -1) >>> 0
    const pBasicAtk = SKILLS_GetSkillById113c(m, pPlayer, 0, -1) >>> 0
    if (pSkills !== 0) {
      m.set(pSkills, D2SkillListStrc.pLeftSkill, pLeftSkill !== 0 ? pLeftSkill : pBasicAtk)
      m.set(pSkills, D2SkillListStrc.pRightSkill, pRightSkill !== 0 ? pRightSkill : pBasicAtk)
    }

    return pPlayer
  }

  private handleGameplayQueue1Packet(clientId: number, pPacket: number, pktLen: number): number {
    if (pktLen <= 0) return 3
    const entry = this.clients.get(clientId)
    if (entry === undefined || entry.closed || entry.pClient === 0) return 2
    this.m.setU32((entry.pClient + 0x3d8) >>> 0, this.virtualTickMs >>> 0)

    const rawBytes = new Uint8Array(pktLen)
    for (let i = 0; i < pktLen; i++) {
      rawBytes[i] = this.m.u8((pPacket + i) >>> 0)
    }

    const callees: C2SPacketCallees113c = {
      startPlayerModeAtCoords: (mem, _pGame, pPlayer, _nPlrMode, _nX, _nY, _bRunOrShift) => {
        applyPlayerPacket113c(this.sliceWorld, pPlayer, rawBytes)
        const activeMode = mem.get(pPlayer, D2UnitStrc.dwAnimMode) >>> 0
        if (
          activeMode === PLRMODE_WALK ||
          activeMode === PLRMODE_RUN ||
          activeMode === PLRMODE_TOWN_WALK
        ) {
          this.broadcastPlayerMove0F(pPlayer, activeMode)
        }
        return 1
      },
      startPlayerModeOnUnit: (
        mem,
        _pGame,
        pPlayer,
        _pTargetUnit,
        _nPlrMode,
        _nX,
        _nY,
        _bRunOrShift,
      ) => {
        applyPlayerPacket113c(this.sliceWorld, pPlayer, rawBytes)
        const activeMode = mem.get(pPlayer, D2UnitStrc.dwAnimMode) >>> 0
        if (
          activeMode === PLRMODE_WALK ||
          activeMode === PLRMODE_RUN ||
          activeMode === PLRMODE_TOWN_WALK
        ) {
          this.broadcastPlayerMove0F(pPlayer, activeMode)
        }
        return 1
      },
      onUnhandledOpcode: (mem, _pGame, pPlayer, opcode, pktPtr, len) => {
        if (opcode === 0x3a && len >= 3) {
          const statId = mem.u8((pktPtr + 1) >>> 0) & 0xff
          const spendCount = (mem.u8((pktPtr + 2) >>> 0) + 1) | 0
          const availPts = STATLIST_GetUnitStat113c(mem, pPlayer, STAT_STATPTS, 0) | 0
          if (statId <= 3 && availPts >= spendCount && spendCount >= 1) {
            const nextPts = (availPts - spendCount) | 0
            const nextVal = (STATLIST_GetUnitStat113c(mem, pPlayer, statId, 0) + spendCount) | 0
            STATLIST_SetUnitStat113c(mem, pPlayer, STAT_STATPTS, nextPts, 0)
            STATLIST_SetUnitStat113c(mem, pPlayer, statId, nextVal, 0)
            D2GAME_PACKET_SendStatByteWordDword113c(
              mem,
              entry.pClient,
              STAT_STATPTS,
              nextPts,
              this.gapBCallees,
            )
            D2GAME_PACKET_SendStatByteWordDword113c(
              mem,
              entry.pClient,
              statId,
              nextVal,
              this.gapBCallees,
            )
          }
          return 3
        }
        if (opcode === 0x15 && len >= 4) {
          // `0x15 ChatMessage`: echo `0x26 ChatMessage` (`[0x26, chatType=1, locale=0, unitType=0, id=0, color=0, subType=0, charName\0, msg\0]`)
          let s1End = 3
          while (s1End < len && rawBytes[s1End] !== 0) s1End++
          const msgBytes = rawBytes.subarray(3, s1End)
          const nameLen = entry.charName.length
          const s2c26 = new Uint8Array(10 + nameLen + 1 + msgBytes.byteLength + 1)
          s2c26[0] = 0x26
          s2c26[1] = 0x01
          for (let i = 0; i < nameLen; i++) {
            s2c26[10 + i] = entry.charName.charCodeAt(i) & 0x7f
          }
          s2c26[10 + nameLen] = 0
          s2c26.set(msgBytes, 10 + nameLen + 1)
          s2c26[s2c26.byteLength - 1] = 0
          for (const recipient of this.clients.values()) {
            if (recipient.closed || recipient.pClient === 0) continue
            if (this.m.u32((recipient.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) !== 4) {
              continue
            }
            this.queueBytesToClientBuffer(mem, recipient.pClient, s2c26)
          }
          return len
        }
        return len
      },
    }

    const res = C2S_DispatchPacketMem113c(
      this.m,
      this.pGame,
      entry.pClient,
      pPacket,
      pktLen,
      callees,
    )
    if (rawBytes[0] === 0x3c && pktLen >= 9 && entry.pPlayer !== 0) {
      const wSkillId = rawBytes[1]! | (rawBytes[2]! << 8)
      const bLeft = rawBytes[4]! !== 0 ? 1 : 0
      const dwItemGuid =
        (rawBytes[5]! | (rawBytes[6]! << 8) | (rawBytes[7]! << 16) | (rawBytes[8]! << 24)) | 0
      NET_SendPacket0x23_AssignSkill113c(
        this.m,
        UNIT_PLAYER,
        entry.playerUnitId,
        entry.pClient,
        bLeft,
        wSkillId,
        dwItemGuid,
        {
          queuePacket: (mem, cli, pktPtr, pktSize) => {
            NET_QueuePacketToClientBuffer113c(mem, cli, 1, pktPtr, pktSize)
          },
        },
      )
    }
    return res
  }

  private broadcastPlayerMove0F(pPlayer: number, animMode: number): void {
    for (const recipient of this.clients.values()) {
      if (recipient.closed || recipient.pClient === 0) continue
      if (this.m.u32((recipient.pClient + D2ClientStrcOffsets.dwClientState) >>> 0) !== 4) continue
      NET_SendUnitMovePacket0F113c(this.m, this.pGame, pPlayer, recipient.pClient, animMode)
    }
  }

  private flushAllClientQueuesToSink(): void {
    for (const entry of this.clients.values()) {
      if (entry.closed || entry.pClient === 0) continue
      this.flushClientQueueToSink(entry)
    }
  }

  private getQueuedByteCount(pClient: number): number {
    if (pClient === 0) return 0
    let total = 0
    let walk = this.m.u32((pClient + 0x1b8) >>> 0) >>> 0
    let guard = 0
    while (walk !== 0 && guard++ < 64) {
      total += this.m.u32(walk) >>> 0
      walk = this.m.u32((walk + 0x204) >>> 0) >>> 0
    }
    return total
  }

  /**
   * Drains `pClient->pPacketDataHead` (`+0x1B8`, `0x208`-byte `D2PacketDataStrc` nodes per `0x6FC4D500`)
   * into discrete validated S2C packets, records each uncompressed packet, and dispatches
   * `<= 0x200`-byte `D2PacketDataStrc` batches through `D2NetPacketSink113c` via `IAT 0x6FD18B64`.
   */
  private flushClientQueueToSink(entry: InternalClientEntry113c): void {
    const m = this.m
    const pHeadQueue = m.u32((entry.pClient + 0x1b8) >>> 0) >>> 0
    if (pHeadQueue === 0) return

    let totalQueued = 0
    let walk = pHeadQueue
    let guard = 0
    while (walk !== 0 && guard++ < 64) {
      const used = m.u32(walk) >>> 0
      totalQueued += used <= 0x200 ? used : 0x200
      walk = m.u32((walk + 0x204) >>> 0) >>> 0
    }
    if (totalQueued === 0) {
      m.setU32((entry.pClient + 0x1b8) >>> 0, 0)
      m.setU32((entry.pClient + 0x1bc) >>> 0, 0)
      return
    }

    const joined = new Uint8Array(totalQueued)
    let writeCursor = 0
    walk = pHeadQueue
    m.setU32((entry.pClient + 0x1b8) >>> 0, 0)
    m.setU32((entry.pClient + 0x1bc) >>> 0, 0)
    guard = 0
    while (walk !== 0 && guard++ < 64) {
      const rawUsed = m.u32(walk) >>> 0
      const used = rawUsed <= 0x200 ? rawUsed : 0x200
      for (let i = 0; i < used; i++) {
        joined[writeCursor++] = m.u8((walk + 0x04 + i) >>> 0)
      }
      const nextNode = m.u32((walk + 0x204) >>> 0) >>> 0
      m.setU32(walk, 0)
      m.setU32((walk + 0x204) >>> 0, m.u32((entry.pClient + 0x1c0) >>> 0) >>> 0)
      m.setU32((entry.pClient + 0x1c0) >>> 0, walk)
      walk = nextNode
    }

    const discretePackets: Uint8Array[] = []
    let offset = 0
    while (offset < joined.byteLength) {
      const pktSize = resolveS2cPacketSize(joined, offset)
      if (pktSize === null || pktSize <= 0 || offset + pktSize > joined.byteLength) {
        discretePackets.push(joined.slice(offset))
        break
      }
      discretePackets.push(joined.slice(offset, offset + pktSize))
      offset += pktSize
    }

    const curFrame = this.frame
    for (let i = 0; i < discretePackets.length; i++) {
      const pktBytes = discretePackets[i]!
      const rec: UncompressedS2CPacketRecord113c = {
        queue: 1,
        clientId: entry.clientId,
        opcode: pktBytes[0]!,
        frame: curFrame,
        bytes: pktBytes,
      }
      this.uncompressedOutbox.push(rec)
      for (const cb of this.uncompressedListeners) {
        cb(rec)
      }
    }

    // Batch discrete packets into `<= 0x200` (`512B`) `D2PacketDataStrc` blocks (`0x6FC4D500` -> `D2Net.#10002`)
    let batchStart = 0
    while (batchStart < discretePackets.length) {
      let batchLen = 0
      let batchEnd = batchStart
      while (batchEnd < discretePackets.length) {
        const nextLen = discretePackets[batchEnd]!.byteLength
        if (batchLen > 0 && batchLen + nextLen > D2PACKET_DATA_MAX_BATCH_113C) {
          break
        }
        batchLen += nextLen
        batchEnd++
      }
      let dstOff = 0
      for (let k = batchStart; k < batchEnd; k++) {
        const part = discretePackets[k]!
        for (let b = 0; b < part.byteLength; b++) {
          m.setU8((this.pSendScratch + dstOff + b) >>> 0, part[b]!)
        }
        dstOff += part.byteLength
      }
      this.packetSink.dispatchIat(D2GAME_NET_IAT_VA_113C.sendPacket_10002, m, [
        1,
        entry.clientId,
        this.pSendScratch,
        dstOff,
      ])
      batchStart = batchEnd
    }
  }

  private drainSinkToConsumers(): void {
    const drained: CapturedS2CPacket113c[] = this.packetSink.drain()
    if (drained.length === 0) return
    const curFrame = this.frame

    for (let i = 0; i < drained.length; i++) {
      const pkt = drained[i]!
      const entry = this.clients.get(pkt.clientId)

      // Direct Queue `0` / immediate `sendPacket_10002` packets (e.g. `[0xAF, 0x01]`, `0x06 GameLogoutSuccess`)
      // that bypassed `pClient->pPacketQueue` are also recorded on the uncompressed stream.
      if (pkt.queue === 0 || (pkt.bytes.byteLength === 1 && pkt.opcode === 0x06)) {
        const uncomp: UncompressedS2CPacketRecord113c = {
          queue: pkt.queue,
          clientId: pkt.clientId,
          opcode: pkt.opcode,
          frame: curFrame,
          bytes: pkt.bytes.slice(),
        }
        this.uncompressedOutbox.push(uncomp)
        for (const cb of this.uncompressedListeners) {
          cb(uncomp)
        }
      }

      const wireBytes = pkt.wireBytes !== undefined ? pkt.wireBytes : pkt.bytes
      const wireRec: WireS2CPacketRecord113c = {
        queue: pkt.queue,
        clientId: pkt.clientId,
        firstOpcode: pkt.opcode,
        frame: curFrame,
        uncompressedBytes: pkt.bytes,
        wireBytes,
      }
      this.wireOutbox.push(wireRec)
      for (const cb of this.wireListeners) {
        cb(wireRec)
      }

      if (entry !== undefined && !entry.closed && entry.stream !== null) {
        if (entry.wireFormat === 'compressed') {
          entry.stream.write(wireBytes)
        } else if (!(pkt.queue === 0 && pkt.opcode === 0xaf)) {
          entry.stream.write(pkt.bytes)
        }
      }
    }
  }
}

export { validateC2sPacket }
