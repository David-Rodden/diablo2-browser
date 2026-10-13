/**
 * Protocol-neutral Battle.net & MCP Realm lobby models.
 */

import type { CharClassId } from './ids.ts'

export interface RealmInfo {
  readonly id: number
  readonly title: string
  readonly description: string
}

export type RealmSummary = RealmInfo

export interface CharSummary {
  readonly name: string
  readonly charClass: CharClassId
  readonly classId?: CharClassId | undefined
  readonly level: number
  readonly hardcore: boolean
  readonly dead: boolean
  readonly expansion: boolean
  readonly ladder: boolean
  readonly act: number
  readonly difficulty: 0 | 1 | 2
  readonly progression?: number | undefined
  readonly expiresAt: number
  readonly equipmentGraphics: Uint8Array // 9 component bytes from 33-byte stat string
  readonly rawStatString: Uint8Array
}

export interface CharCreateSpec {
  readonly name: string
  readonly classId: CharClassId
  readonly expansion?: boolean | undefined
  readonly hardcore?: boolean | undefined
  readonly ladder?: boolean | undefined
}

export interface GameSummary {
  readonly name: string
  readonly description: string
  readonly playerCount: number
  readonly index: number
  readonly status: number
}

export type GameListEntry = GameSummary

export interface GameCreateSpec {
  readonly name: string
  readonly password?: string | undefined
  readonly description?: string | undefined
  readonly difficulty?: 0 | 1 | 2 | undefined
  readonly maxPlayers?: number | undefined
  readonly levelDiff?: number | undefined
}

export interface GameInfoDetail {
  readonly name: string
  readonly status: number
  readonly uptimeSec: number
  readonly creatorLevel?: number | undefined
  readonly levelDiff?: number | undefined
  readonly maxPlayers: number
  readonly description?: string | undefined
  readonly players: readonly {
    readonly name: string
    readonly charClass: CharClassId
    readonly level: number
  }[]
}

export type ChatEventKind =
  | 'showUser'
  | 'join'
  | 'leave'
  | 'whisper'
  | 'talk'
  | 'broadcast'
  | 'channel'
  | 'userFlags'
  | 'whisperSent'
  | 'channelFull'
  | 'channelDoesNotExist'
  | 'channelRestricted'
  | 'info'
  | 'error'
  | 'emote'
  | 'unknown'

export interface ChatEvent {
  readonly eventId: number
  readonly kind: ChatEventKind
  readonly userFlags: number
  readonly ping: number
  readonly username: string
  readonly text: string
}
