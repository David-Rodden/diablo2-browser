/**
 * `D2gsAdapter` implementing protocol-neutral `GameServerAdapter` over `D2gsSession`.
 */

import { type Clock, defaultClock } from '../core/clock.ts'
import { Emitter } from '../core/emitter.ts'
import type { TextEncoding } from '../core/text-codec.ts'
import type { ClientCommand } from '../domain/client-command.ts'
import type { GameServerAdapter, GameServerStats } from '../domain/game-server-adapter.ts'
import type { ItemDataTables } from '../domain/ids.ts'
import type { ServerEvent } from '../domain/server-event.ts'
import type { CloseReason } from '../transport/byte-stream.ts'
import { decodeD2gsS2cPacket, encodeD2gsClientCommand } from './registry.ts'
import type { D2gsSession } from './session.ts'

export interface D2gsAdapterOptions {
  readonly session: D2gsSession
  readonly tables: ItemDataTables
  readonly encoding?: TextEncoding | undefined
  readonly clock?: Clock | undefined
}

/** Reports a failed S2C packet loudly: stage, opcode, raw hex and the error stack. */
function reportPacketError(stage: string, pkt: Uint8Array, err: unknown): void {
  const opcode = pkt.byteLength > 0 ? `0x${pkt[0]!.toString(16).padStart(2, '0')}` : '(empty)'
  const hex = Array.from(pkt, (b) => b.toString(16).padStart(2, '0')).join(' ')
  const detail = err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err)
  console.error(`[d2gs] S2C ${opcode} ${stage} failed; packet=[${hex}]\n${detail}`)
}

export class D2gsAdapter implements GameServerAdapter {
  private readonly session: D2gsSession
  private readonly tables: ItemDataTables
  private readonly encoding: TextEncoding
  private readonly clock: Clock
  private readonly eventEmitter = new Emitter<ServerEvent>()
  private readonly earlyEvents: Array<{ readonly ev: ServerEvent; readonly pkt: Uint8Array }> = []
  private hasAttachedListener = false

  private unknownPacketsCount = 0
  private opaquePacketsCount = 0
  private protocolErrorsCount = 0
  private listenerErrorsCount = 0

  constructor(options: D2gsAdapterOptions) {
    this.session = options.session
    this.tables = options.tables
    this.encoding = options.encoding ?? 'gbk'
    this.clock = options.clock ?? defaultClock

    this.session.onPacket((pkt) =>
      this.handlePacket(pkt),
    )
  }

  /**
   * Decode one S2C packet and dispatch it. Decode failures are protocol errors; an exception thrown by a
   * listener (OnlineSession / ClientWorld applying the event) is a client bug. Neither may be swallowed
   * silently (AGENTS.md anti-silent-failure): both are counted and reported via `console.error` with the
   * packet id, the raw bytes and the stack, and the session loop keeps running so the remaining packets of
   * the chunk are still applied (Refs #916: a swallowed exception while applying a death packet left the
   * monster standing and targetable with no trace).
   */
  private handlePacket(pkt: Uint8Array): void {
    let ev: ServerEvent
    try {
      ev = decodeD2gsS2cPacket(pkt, {
        tables: this.tables,
        encoding: this.encoding,
        rttMs: this.session.rttMs,
      })
    } catch (err) {
      this.protocolErrorsCount++
      reportPacketError('decode', pkt, err)
      return
    }
    if (ev.type === 'Opaque') {
      this.opaquePacketsCount++
    }
    if (!this.hasAttachedListener) {
      this.earlyEvents.push({ ev, pkt })
      return
    }
    this.emitEvent(ev, pkt)
  }

  private emitEvent(ev: ServerEvent, pkt: Uint8Array): void {
    try {
      this.eventEmitter.emit(ev)
    } catch (err) {
      this.protocolErrorsCount++
      this.listenerErrorsCount++
      reportPacketError(`listener (${ev.type})`, pkt, err)
    }
  }

  /** Number of S2C events whose listener threw (each one was reported via `console.error`). */
  get listenerErrors(): number {
    return this.listenerErrorsCount
  }

  get state(): 'loading' | 'ingame' | 'closed' {
    const s = this.session.state
    if (s === 'closed') return 'closed'
    if (s === 'ingame') return 'ingame'
    return 'loading'
  }

  onEvent(cb: (ev: ServerEvent) => void): () => void {
    const unsub = this.eventEmitter.on(cb)
    if (!this.hasAttachedListener) {
      this.hasAttachedListener = true
      if (this.earlyEvents.length > 0) {
        const buffered = this.earlyEvents.splice(0, this.earlyEvents.length)
        for (const { ev, pkt } of buffered) {
          this.emitEvent(ev, pkt)
        }
      }
    }
    return unsub
  }

  onClose(cb: (reason: CloseReason) => void): () => void {
    return this.session.onClose(cb)
  }

  send(cmd: ClientCommand): void {
    if (cmd.type === 'Ping') {
      this.session.sendPing()
      return
    }
    const packets = encodeD2gsClientCommand(
      cmd,
      this.encoding,
      Math.floor(this.clock.now()) >>> 0,
    )
    for (const pkt of packets) {
      this.session.sendRawPacket(pkt)
    }
  }

  get stats(): GameServerStats {
    const s = this.session.stats
    return {
      rttMs: s.rttMs,
      bytesIn: s.bytesIn,
      bytesOut: s.bytesOut,
      packetsIn: s.packetsIn,
      packetsOut: s.packetsOut,
      unknownPackets: this.unknownPacketsCount,
      opaquePackets: this.opaquePacketsCount,
      protocolErrors: this.protocolErrorsCount,
    }
  }

  leave(): void {
    this.session.leaveAndClose()
  }

  async close(): Promise<void> {
    this.session.leaveAndClose()
  }
}
