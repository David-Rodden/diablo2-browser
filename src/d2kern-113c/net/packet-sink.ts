/**
 * Diablo II v1.13c `D2Net.dll` import-table packet sink (`IAT 0x6FD18B48..0x6FD18B70`).
 *
 * Replaces `D2Net.dll` sockets in the isomorphic kernel by capturing outbound S2C packets
 * emitted through `D2Net.#10002` (`D2Net_SendPacket`, `stdcall(nQueue, nClientId, pPacket, nLen)`,
 * max frame length `0x204` bytes at `0x6FBF63E0`) into deterministic in-memory queues that the
 * WebSocket room loop drains per frame.
 */
import type { Memory113c } from '../mem/sparse-memory.ts'

export const D2NET_MAX_PACKET_LEN_113C = 0x204

export interface CapturedS2CPacket113c {
  readonly queue: number
  readonly clientId: number
  readonly opcode: number
  readonly bytes: Uint8Array
}

export class D2NetPacketSink113c {
  private readonly outbox: CapturedS2CPacket113c[] = []
  private readonly clientAddrs = new Map<number, string>()

  /**
   * `D2Net.#10002` (`0x6FBF63E0` / `D2Game IAT 0x6FD18B64`):
   * `int __stdcall D2Net_SendPacket(int nQueue, int nClientId, const uint8_t* pPacket, int nLen)`
   */
  sendPacketFromMemory(
    m: Memory113c,
    nQueue: number,
    nClientId: number,
    pPacket: number,
    nLen: number,
  ): number {
    if (pPacket === 0 || nLen <= 0 || nLen > D2NET_MAX_PACKET_LEN_113C) {
      return 0
    }
    const bytes = new Uint8Array(nLen)
    for (let i = 0; i < nLen; i++) {
      bytes[i] = m.u8(pPacket + i)
    }
    this.outbox.push({
      queue: nQueue | 0,
      clientId: nClientId >>> 0,
      opcode: bytes[0]!,
      bytes,
    })
    return nLen
  }

  /** Direct `Uint8Array` overload for TS callers constructing packet buffers on the stack. */
  sendPacketBytes(nQueue: number, nClientId: number, payload: Uint8Array): number {
    if (payload.length === 0 || payload.length > D2NET_MAX_PACKET_LEN_113C) {
      return 0
    }
    const bytes = payload.slice()
    this.outbox.push({
      queue: nQueue | 0,
      clientId: nClientId >>> 0,
      opcode: bytes[0]!,
      bytes,
    })
    return bytes.length
  }

  /** `D2Net.#10015` / `#10016`: register/query virtual client address string. */
  setClientAddress(nClientId: number, address: string): void {
    this.clientAddrs.set(nClientId >>> 0, address)
  }

  getClientAddress(nClientId: number): string {
    return this.clientAddrs.get(nClientId >>> 0) ?? '127.0.0.1'
  }

  /** `D2Net.#10024` / `#10035`: disconnect/drop client stub. */
  disconnectClient(nClientId: number): number {
    this.clientAddrs.delete(nClientId >>> 0)
    return 1
  }

  get pendingCount(): number {
    return this.outbox.length
  }

  peekAll(): readonly CapturedS2CPacket113c[] {
    return this.outbox
  }

  drain(clientId?: number): CapturedS2CPacket113c[] {
    if (clientId === undefined) {
      return this.outbox.splice(0, this.outbox.length)
    }
    const target = clientId >>> 0
    const matched: CapturedS2CPacket113c[] = []
    let writeIdx = 0
    for (let i = 0; i < this.outbox.length; i++) {
      const pkt = this.outbox[i]!
      if (pkt.clientId === target) matched.push(pkt)
      else this.outbox[writeIdx++] = pkt
    }
    this.outbox.length = writeIdx
    return matched
  }

  clear(): void {
    this.outbox.length = 0
  }
}
