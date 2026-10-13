import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_INPUT_MAX_CHARS,
  CHAT_OVERLAY_LINE_HEIGHT,
  CHAT_OVERLAY_MAX_ACTIVE_LINES,
  CHAT_OVERLAY_MAX_LINES_PER_MESSAGE,
  CHAT_OVERLAY_TTL_MS,
  MESSAGE_LOG_MAX_ENTRIES,
  OVERHEAD_BUBBLE_BASELINE_OFFSET_Y,
  OVERHEAD_BUBBLE_MAX_WIDTH,
  OVERHEAD_BUBBLE_TTL_MS,
  computeChatOverlayLayout113c,
  computeOverheadBubbleLayout113c,
  formatChatPacket0x26,
  formatEventPacket0x5A,
  parseInGameChatInput,
  resolveChatTblIndex,
  resolveOverheadBubbleOverlap113c,
  resolveOverheadBubbleText113c,
  wrapChatText113c,
} from '../src/common/chat/chat-113c.ts'
import { setLang } from '../src/client/i18n/lang.ts'
import { CommandMapper, ViewportCamera } from '../src/client/input/command-mapper.ts'
import { OnlineSession } from '../src/client/session/online-session.ts'
import { HudModel } from '../src/client/ui-model/hud-model.ts'
import { HudManager } from '../src/client/ui/hud-manager.ts'
import { ClientWorld } from '../src/client/world/client-world.ts'

function createMockCanvasContext() {
  const fillRectCalls: Array<{ x: number; y: number; w: number; h: number; fillStyle: string }> = []
  const fillTextCalls: Array<{ text: string; x: number; y: number; fillStyle: string }> = []
  const ctx: any = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillRectCalls.push({ x, y, w, h, fillStyle: String(ctx.fillStyle) })
    }),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => {
      fillTextCalls.push({ text, x, y, fillStyle: String(ctx.fillStyle) })
    }),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn((w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    setTransform: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
  }
  return { ctx, fillRectCalls, fillTextCalls }
}

function createMockCanvas(width = 800, height = 600) {
  const { ctx, fillRectCalls, fillTextCalls } = createMockCanvasContext()
  const canvas: any = {
    width,
    height,
    style: {},
    getContext: vi.fn(() => ctx),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  }
  return { canvas, ctx, fillRectCalls, fillTextCalls }
}

describe('Diablo II 1.13c In-Game Chat System (Issue #910)', () => {
  beforeEach(() => {
    setLang('en')
  })

  describe('R1. Top-Left Real-Time Chat & Event Message Stream Overlay (0x6fb2b730 / 0x6fb2d850)', () => {
    it('enforces 10,000 ms (0x2710) TTL on active top-left overlay while preserving Message Log', () => {
      expect(CHAT_OVERLAY_TTL_MS).toBe(10_000)
      const world = new ClientWorld()
      world.apply(
        {
          type: 'Chat',
          kind: 'say',
          from: 'Sorceress',
          text: 'Need TP please',
          color: 0,
        },
        1_000,
      )

      expect(world.activeChatOverlayEntries).toHaveLength(1)
      expect(world.activeChatOverlayEntries[0]?.text).toBe('Sorceress: Need TP please')
      expect(world.activeChatOverlayEntries[0]?.expireAtMs).toBe(11_000)
      expect(world.messageLogEntries).toHaveLength(1)

      // At 10,999 ms (just before 10s expiration), message is still active
      world.expireChatAndOverhead(10_999)
      expect(world.activeChatOverlayEntries).toHaveLength(1)

      // At 11,000 ms (10,000 ms elapsed), message is evicted from top-left overlay
      world.expireChatAndOverhead(11_000)
      expect(world.activeChatOverlayEntries).toHaveLength(0)
      // Still preserved in M Message Log
      expect(world.messageLogEntries).toHaveLength(1)
      expect(world.messageLogEntries[0]?.text).toBe('Sorceress: Need TP please')
    })

    it('word-wraps up to 6 lines per message and preserves inline color codes across wrapped lines', () => {
      expect(CHAT_OVERLAY_MAX_LINES_PER_MESSAGE).toBe(6)
      const measure = (s: string) => s.replace(/\xffc[0-9a-zA-Z:;/.+-]/g, '').length * 10
      const text =
        '\xffc2Green start word1 word2 word3 \xffc8orange continuation word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15'
      const wrapped = wrapChatText113c(text, measure, 120, 0)
      expect(wrapped.length).toBeGreaterThan(1)
      expect(wrapped.length).toBeLessThanOrEqual(6)
      // Continuation lines after \xffc8 carry the inline color prefix
      const hasCarriedOrange = wrapped.slice(1).some((l) => l.text.startsWith('\xffc8'))
      expect(hasCarriedOrange).toBe(true)
    })

    it('avoids top-left portraits (y=20 vs y=95) and shifts right when a left panel is open', () => {
      const baseLayout = computeChatOverlayLayout113c({
        screenWidth: 800,
        leftPanelOpen: false,
        rightPanelOpen: false,
        hasTopLeftPortraits: false,
      })
      expect(baseLayout).toMatchObject({
        startX: 15,
        startY: 20,
        maxWrapWidth: 730,
      })

      const portraitLayout = computeChatOverlayLayout113c({
        screenWidth: 800,
        leftPanelOpen: false,
        rightPanelOpen: false,
        hasTopLeftPortraits: true,
      })
      expect(portraitLayout).toMatchObject({
        startX: 15,
        startY: 95,
        maxWrapWidth: 730,
      })

      const leftOpenLayout = computeChatOverlayLayout113c({
        screenWidth: 800,
        leftPanelOpen: true,
        rightPanelOpen: false,
        hasTopLeftPortraits: false,
      })
      expect(leftOpenLayout).toMatchObject({
        startX: 415,
        startY: 20,
        maxWrapWidth: 300,
      })
    })

    it('caps rendered active overlay lines at 18 (0x12) with 15px line height and translucent black rect', () => {
      expect(CHAT_OVERLAY_MAX_ACTIVE_LINES).toBe(18)
      expect(CHAT_OVERLAY_LINE_HEIGHT).toBe(15)
      const { canvas, ctx, fillRectCalls, fillTextCalls } = createMockCanvas(800, 600)
      const hud = new HudManager(canvas)

      const messages = []
      for (let i = 1; i <= 25; i++) {
        messages.push({
          text: `Line ${i}`,
          color: 0,
          createdAtMs: 1000,
          expireAtMs: 11000,
        })
      }
      hud.chatOverlayMessages = messages
      hud.renderChatOverlay(ctx, 800, 2000)

      // Only the newest 18 lines (Line 8 .. Line 25) should be rendered
      const renderedTexts = fillTextCalls.map((c) => c.text)
      expect(renderedTexts).not.toContain('Line 7')
      expect(renderedTexts).toContain('Line 8')
      expect(renderedTexts).toContain('Line 25')
      expect(fillRectCalls.filter((r) => r.fillStyle === 'rgba(0, 0, 0, 0.65)')).toHaveLength(18)
    })
  })

  describe('R2. Unit Overhead Speech Bubble (!text Overhead Speech, 0x6fb2b470 / 0x6fb2dc00 / 0x6fb2af20)', () => {
    it('sets unit.overheadText with 10s TTL on S2C 0x26 (chatType=0x05) without polluting chat overlay or message log', () => {
      expect(OVERHEAD_BUBBLE_TTL_MS).toBe(10_000)
      const world = new ClientWorld()
      world.apply({
        type: 'UnitAssign',
        unit: {
          unitType: 'player',
          id: 1,
          classId: 1,
          name: 'Sorceress',
          x: 5000,
          y: 5000,
        },
        isSelf: true,
      })

      // S2C 0x26 with chatType = 0x05 (overhead speech)
      world.apply(
        {
          type: 'Chat',
          kind: 'overhead',
          eventType: 0x05,
          unit: { unitType: 0, id: 1 },
          from: 'Sorceress',
          text: 'Follow me!',
          color: 0,
        },
        2_000,
      )

      const selfUnit = world.getUnit('player', 1)
      expect(selfUnit?.overheadText).toBe('Follow me!')
      expect(selfUnit?.overheadExpireMs).toBe(12_000)
      // Must NOT push to top-left chat stream or message log
      expect(world.activeChatOverlayEntries).toHaveLength(0)
      expect(world.messageLogEntries).toHaveLength(0)

      // Expires after 10,000 ms
      world.expireChatAndOverhead(12_000)
      expect(selfUnit?.overheadText).toBeUndefined()
    })

    it('clears unit overhead speech on S2C 0x76 (UnitOverhead clear) or empty overhead string', () => {
      const world = new ClientWorld()
      world.apply({
        type: 'UnitAssign',
        unit: {
          unitType: 'player',
          id: 1,
          classId: 1,
          name: 'Sorceress',
          x: 5000,
          y: 5000,
        },
        isSelf: true,
      })
      world.noteOutgoingCommand({ type: 'OverheadChat', text: 'Help!' }, 1_000)
      expect(world.getUnit('player', 1)?.overheadText).toBe('Help!')

      world.apply({ type: 'UnitHoverTextClear', rawUnitType: 0, id: 1 }, 1_500)
      expect(world.getUnit('player', 1)?.overheadText).toBeUndefined()
    })

    it('wraps overhead bubbles at 180px (0xB4) and resolves overlapping rectangles upward (0x6fb2af20)', () => {
      expect(OVERHEAD_BUBBLE_MAX_WIDTH).toBe(180)
      const measure = (s: string) => s.length * 8
      const layout = computeOverheadBubbleLayout113c('Hello Sanctuary', 400, 300, measure, 0)
      expect(layout).not.toBeNull()
      expect(layout!.rect.w).toBe(15 * 8 + 20)
      expect(layout!.rect.h).toBe(1 * 15 + 6)
      expect(layout!.rect.y).toBe(300 - 50 - 15 - 6)

      // Two bubbles at identical screen position should not overlap after resolveOverheadBubbleOverlap113c
      const r1 = resolveOverheadBubbleOverlap113c(layout!.rect, [])
      const r2 = resolveOverheadBubbleOverlap113c(layout!.rect, [r1])
      expect(r2.y + r2.h).toBeLessThanOrEqual(r1.y)
    })

    it('resolves Shrine/Object overhead .tbl string indices (D2Game.dll 0x6fc8da80 3683+Code & D2Client.dll 0x6fb2daa0) and renders text inside the bubble rect (Issue #995)', () => {
      // Skill Shrine (Code = 12 -> 3683 + 12 = 3695) & Mana Recharge Shrine (Code = 13 -> 3683 + 13 = 3696)
      expect(resolveOverheadBubbleText113c('3695', 'object', 'ENG')).toBe(
        'You feel more skillful.',
      )
      expect(resolveOverheadBubbleText113c('3695', 'object', 'CHI')).toBe(
        '你覺得技能變強了。',
      )
      expect(resolveOverheadBubbleText113c('3696', 'object', 'ENG')).toBe(
        'Your spiritual force recovers quickly.',
      )
      expect(resolveOverheadBubbleText113c('3696', 'object', 'CHI')).toBe(
        '你的精神力量快速的回復。',
      )
      // All 23 Shrine codes (0..22 -> 3683..3705) must resolve to non-numeric localized strings
      for (let code = 0; code <= 22; code++) {
        const strId = String(3683 + code)
        const en = resolveOverheadBubbleText113c(strId, 'object', 'ENG')
        const zh = resolveOverheadBubbleText113c(strId, 'object', 'CHI')
        expect(en.length).toBeGreaterThan(0)
        expect(en).not.toBe(strId)
        expect(zh.length).toBeGreaterThan(0)
        expect(zh).not.toBe(strId)
      }
      // Player !text with numeric content stays literal (0x6fb2dc00)
      expect(resolveOverheadBubbleText113c('3695', 'player', 'ENG')).toBe('3695')

      // Verify renderOverheadSpeechBubbles draws localized text with alphabetic baseline inside the box
      const { canvas, ctx, fillRectCalls, fillTextCalls } = createMockCanvas(800, 600)
      const hud = new HudManager(canvas)
      hud.lang = 'CHI'
      hud.overheadSpeechBubbles = [
        {
          unitType: 'object',
          unitId: 42,
          unitKey: 'object:42',
          text: '3695',
          color: 0,
          screenX: 400,
          screenY: 300,
        },
      ]
      hud.renderOverheadSpeechBubbles(ctx, 1_000)

      expect(fillRectCalls).toHaveLength(1)
      expect(fillTextCalls).toHaveLength(1)
      const box = fillRectCalls[0]!
      const drawnText = fillTextCalls[0]!
      expect(drawnText.text).toBe('你覺得技能變強了。')
      expect(drawnText.y).toBe(box.y + OVERHEAD_BUBBLE_BASELINE_OFFSET_Y)
      // 13px font16 glyph [drawnText.y - 13, drawnText.y] must sit strictly inside [box.y, box.y + box.h]
      expect(drawnText.y - 13).toBeGreaterThanOrEqual(box.y)
      expect(drawnText.y).toBeLessThanOrEqual(box.y + box.h)
      expect(ctx.strokeRect).not.toHaveBeenCalled()
    })
  })

  describe('R3. 1.13c In-Game Chat Input Bar & Command Parser', () => {
    it('parses !overhead, %whisper, /w, /whisper, /msg, /r, /reply, /clear, /fps, and /players N', () => {
      expect(CHAT_INPUT_MAX_CHARS).toBe(120)
      expect(parseInGameChatInput('!Selling Shako')).toEqual({
        kind: 'overhead',
        text: 'Selling Shako',
      })
      expect(parseInGameChatInput('%DeckardCain Stay awhile')).toEqual({
        kind: 'whisper',
        target: 'DeckardCain',
        text: 'Stay awhile',
      })
      expect(parseInGameChatInput('/w Akara Need potions')).toEqual({
        kind: 'whisper',
        target: 'Akara',
        text: 'Need potions',
      })
      expect(parseInGameChatInput('/whisper Charsi Imbue ready')).toEqual({
        kind: 'whisper',
        target: 'Charsi',
        text: 'Imbue ready',
      })
      expect(parseInGameChatInput('/msg Tyrael Open portal')).toEqual({
        kind: 'whisper',
        target: 'Tyrael',
        text: 'Open portal',
      })
      expect(parseInGameChatInput('/r On my way!', 'Tyrael')).toEqual({
        kind: 'whisper',
        target: 'Tyrael',
        text: 'On my way!',
      })
      expect(parseInGameChatInput('/reply Be right there', 'Akara')).toEqual({
        kind: 'whisper',
        target: 'Akara',
        text: 'Be right there',
      })
      expect(parseInGameChatInput('/r No target yet', null)).toEqual({
        kind: 'local_error',
        errorKey: 'noReplyTarget',
      })
      expect(parseInGameChatInput('/clear')).toEqual({ kind: 'local_clear' })
      expect(parseInGameChatInput('/fps')).toEqual({ kind: 'local_fps' })
      expect(parseInGameChatInput('/players 8')).toEqual({
        kind: 'local_players',
        count: 8,
        valid: true,
      })
    })

    it('executes submitChatInput and ArrowUp/ArrowDown history navigation on OnlineSession', () => {
      const { canvas } = createMockCanvas(800, 600)
      const hudManager = new HudManager(canvas)
      const session = new OnlineSession({ hudManager })
      session.handleServerEvent({
        type: 'UnitAssign',
        unit: {
          unitType: 'player',
          id: 1,
          classId: 1,
          name: 'Sorceress',
          x: 5000,
          y: 5000,
        },
        isSelf: true,
      })

      // 1. !overhead sets local overhead bubble and dispatches OverheadChat
      session.submitChatInput('!Tp up', 1_000)
      expect(session.world.getUnit('player', 1)?.overheadText).toBe('Tp up')
      expect(session.getSentCommands().at(-1)).toEqual({
        type: 'OverheadChat',
        text: 'Tp up',
      })

      // 2. /w target msg dispatches whisper and sets lastWhisperTarget
      session.submitChatInput('/w Paladin Baal run next', 2_000)
      expect(session.world.lastWhisperTarget).toBe('Paladin')
      expect(session.getSentCommands().at(-1)).toEqual({
        type: 'Chat',
        text: 'Baal run next',
        whisperTo: 'Paladin',
      })

      // 3. /r msg replies to lastWhisperTarget
      session.submitChatInput('/r Ready!', 3_000)
      expect(session.getSentCommands().at(-1)).toEqual({
        type: 'Chat',
        text: 'Ready!',
        whisperTo: 'Paladin',
      })

      // 4. /fps toggles hudManager.showFps
      expect(hudManager.showFps).toBe(false)
      session.submitChatInput('/fps', 4_000)
      expect(hudManager.showFps).toBe(true)

      // 5. /players 8 adds system message
      session.submitChatInput('/players 8', 5_000)
      expect(session.world.activeChatOverlayEntries.some((m) => m.text === 'players set to 8')).toBe(
        true,
      )

      // 6. /clear clears active overlay but keeps messageLogEntries
      session.submitChatInput('/clear', 6_000)
      expect(session.world.activeChatOverlayEntries).toHaveLength(0)
      expect(session.world.messageLogEntries.length).toBeGreaterThan(0)

      // 7. Input history navigation
      expect(session.navigateChatInputHistory('up')).toBe('/clear')
      expect(session.navigateChatInputHistory('up')).toBe('/players 8')
      expect(session.navigateChatInputHistory('down')).toBe('/clear')
    })
  })

  describe('R4. S2C 0x26 & S2C 0x5A Multilingual TBL Formatting & Squelch/Ignore Filtering', () => {
    it('formats S2C 0x26 (0x01 say, 0x02 whisper from, 0x06 whisper to) in ENG and CHI', () => {
      const sayEn = formatChatPacket0x26(
        { chatType: 0x01, charName: 'Amazon', text: 'Hello', color: 0 },
        'ENG',
      )
      expect(sayEn.text).toBe('Amazon: Hello')

      const sayZh = formatChatPacket0x26(
        { chatType: 0x01, charName: 'Amazon', text: 'Hello', color: 0 },
        'CHI',
      )
      expect(sayZh.text).toBe('Amazon：Hello')

      const whisperFromEn = formatChatPacket0x26(
        { chatType: 0x02, charName: 'Necro', accountName: 'bnet_nec', text: 'Trade?', color: 2 },
        'ENG',
      )
      expect(whisperFromEn.text).toBe('Necro (bnet_nec) whispers: Trade?')

      const whisperFromZh = formatChatPacket0x26(
        { chatType: 0x02, charName: 'Necro', accountName: 'bnet_nec', text: 'Trade?', color: 2 },
        'CHI',
      )
      expect(whisperFromZh.text).toBe('Necro (bnet_nec)耳語：Trade?')

      const whisperToEn = formatChatPacket0x26(
        { chatType: 0x06, charName: 'Barb', text: 'Sure', color: 2 },
        'ENG',
      )
      expect(whisperToEn.text).toBe('\xffc0You whispered to \xffc1Barb\xffc0: Sure')

      const whisperToZh = formatChatPacket0x26(
        { chatType: 0x06, charName: 'Barb', text: 'Sure', color: 2 },
        'CHI',
      )
      expect(whisperToZh.text).toBe('\xffc0你的耳語對像是\xffc1Barb\xffc0：Sure')
    })

    it('formats S2C 0x5A event messages (0x00..0x12) using authentic .tbl strings in ENG and CHI', () => {
      expect(
        formatEventPacket0x5A({ eventType: 0x02, color: 4, arg: 0, name1: 'Paladin', name2: 'pal_acc' }, 'ENG').text,
      ).toContain('Paladin')
      expect(
        formatEventPacket0x5A({ eventType: 0x02, color: 4, arg: 0, name1: 'Paladin', name2: 'pal_acc' }, 'CHI').text,
      ).toContain('暗黑破壞神')

      expect(
        formatEventPacket0x5A({ eventType: 0x11, color: 4, arg: 42, name1: '', name2: '' }, 'ENG').text,
      ).toBe('42 Stones of Jordan Sold to Merchants')
      expect(
        formatEventPacket0x5A({ eventType: 0x12, color: 4, arg: 0, name1: '', name2: '' }, 'ENG').text,
      ).toBe('Diablo Walks the Earth')
    })

    it('filters incoming chat, overhead speech, and whispers when sender is squelched or ignored', () => {
      const world = new ClientWorld()
      world.apply({
        type: 'Party',
        kind: 'roster',
        playerId: 2,
        charName: 'Spammer',
        charClass: 4,
        charLevel: 10,
        partyId: 0xffff,
      })

      // Squelch Spammer
      world.setPlayerSquelched(2, true)
      expect(world.isPlayerSquelched('Spammer')).toBe(true)

      // Normal chat (0x01), whisper (0x02), and overhead (0x05) from Spammer are dropped
      world.apply({ type: 'Chat', kind: 'say', unit: { unitType: 0, id: 2 }, from: 'Spammer', text: 'Buy gold' })
      world.apply({ type: 'Chat', kind: 'whisper', unit: { unitType: 0, id: 2 }, from: 'Spammer', text: 'PM spam' })
      world.apply({ type: 'Chat', kind: 'overhead', unit: { unitType: 0, id: 2 }, from: 'Spammer', text: 'Overhead spam' })
      expect(world.activeChatOverlayEntries).toHaveLength(0)
      expect(world.messageLogEntries).toHaveLength(0)

      // Unsquelch but Ignore Spammer: normal chat allowed, whisper dropped
      world.setPlayerSquelched(2, false)
      world.setPlayerIgnored(2, true)
      world.apply({ type: 'Chat', kind: 'whisper', unit: { unitType: 0, id: 2 }, from: 'Spammer', text: 'Blocked whisper' })
      expect(world.activeChatOverlayEntries).toHaveLength(0)

      world.apply({ type: 'Chat', kind: 'say', unit: { unitType: 0, id: 2 }, from: 'Spammer', text: 'Allowed public chat' })
      expect(world.activeChatOverlayEntries).toHaveLength(1)
    })
  })

  describe('R5. M Key Message Log Panel (0x6fb2c770 MSG_OpenMessageLog)', () => {
    it('toggles leftPanel="msg" on M key in CommandMapper and HudManager and mini-panel msg button', () => {
      const { canvas } = createMockCanvas(800, 600)
      const hud = new HudManager(canvas)
      const world = new ClientWorld()
      const hudModel = new HudModel({ world, hudManager: hud })

      expect(hud.leftPanel).toBe('none')
      hud.handleKeyDown('m')
      expect(hud.leftPanel).toBe('msg')
      expect(hudModel.getSnapshot().panels.msg).toBe(true)
      expect(hudModel.getSnapshot().panels.messageLog).toBe(true)

      hud.handleKeyDown('m')
      expect(hud.leftPanel).toBe('none')

      // Also verify CommandMapper 'M' hotkey
      const mapper = new CommandMapper({
        world,
        camera: new ViewportCamera(800, 600),
        hudManager: hud,
        hudModel,
      })
      mapper.handleKeyDown({ key: 'M' })
      expect(hud.leftPanel).toBe('msg')
    })

    it('persists up to 128 entries (0x80) in Message Log and supports Clear Messages and Close buttons', () => {
      expect(MESSAGE_LOG_MAX_ENTRIES).toBe(128)
      const { canvas, fillTextCalls } = createMockCanvas(800, 600)
      const hud = new HudManager(canvas)
      const world = new ClientWorld()
      const hudModel = new HudModel({ world, hudManager: hud })
      hud.onClearMessages = () => world.clearMessageLog()

      for (let i = 1; i <= 140; i++) {
        world.apply(
          {
            type: 'Chat',
            kind: 'say',
            from: 'Hero',
            text: `Msg #${i}`,
            color: 0,
          },
          i * 100,
        )
      }

      // Capped at 128 entries (Msg #13 .. Msg #140)
      expect(world.messageLogEntries).toHaveLength(128)
      expect(world.messageLogEntries[0]?.text).toBe('Hero: Msg #13')
      expect(world.messageLogEntries[127]?.text).toBe('Hero: Msg #140')

      // Open Message Log panel and render
      hud.toggleLeftPanel('msg')
      hudModel.syncFromWorld()
      hud.render()

      const renderedTitle = resolveChatTblIndex(0x0fc3, 'ENG') || 'Message Log'
      expect(fillTextCalls.some((c) => c.text.includes(renderedTitle))).toBe(true)

      // Clear Messages callback empties messageLogEntries and activeChatOverlayEntries
      hud.onClearMessages?.()
      expect(world.messageLogEntries).toHaveLength(0)
      expect(world.activeChatOverlayEntries).toHaveLength(0)
    })
  })
})
