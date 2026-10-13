/**
 * Diablo II v1.13c Authentic Dynamic Cursor & Idle State Machine (`src/ui/cursor.ts`).
 *
 * Implements:
 * - 3-State Cursor Machine:
 *   1. POINTING: Active state when mouse is moving or idle < 2000ms. Renders `protate` swaying frames.
 *   2. OPENING: Triggered after 2000ms of inactivity. Plays `ohand` 8 frames sequentially.
 *   3. OPEN_IDLE: Once `ohand` finishes, loops `orotate` 8 frames.
 *   - Any mouse movement or mouse event (mousedown/mouseup) resets the idle timer back to 0
 *     and returns immediately to POINTING.
 * - Accurate Hotspot and Coordinate Mapping:
 *   - Mouse position (mouseX, mouseY) is the cursor hotspot.
 *   - Hand cursor draws with index finger tip at (mouseX, mouseY).
 *   - Held items (this.inventory.cursorItem) are rendered centered at the cursor hotspot.
 * - Zero Runtime MPQ/DLL calls.
 */

import {
  BUYSELL_CURSOR_FRAMES,
  CURSOR_METADATA,
  type BuySellCursorMode,
  type CursorAtlasMetadata,
  type CursorFrameMeta,
} from '../../common/items/cursor-meta.ts'
import { reportMissingArt } from '../scene/world-renderer.ts'
import { drawImageWithEtherealAlpha } from './inventory.ts'

export { BUYSELL_CURSOR_FRAMES, type BuySellCursorMode }
export type CursorState = 'POINTING' | 'OPENING' | 'OPEN_IDLE' | 'RELEASE' | 'CLICK_DOWN' | 'TARGET_HOLD'
export type CursorAnimation = 'protate' | 'ohand' | 'orotate' | 'buysell'

export interface CursorRenderInfo {
  readonly state: CursorState
  readonly animation: CursorAnimation
  readonly frameIndex: number
  readonly frame: CursorFrameMeta
  readonly drawX: number
  readonly drawY: number
  readonly hotspotX: number
  readonly hotspotY: number
  readonly bounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

export interface HeldItemRenderInfo {
  readonly atlas: CanvasImageSource
  readonly rect: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
  }
  readonly ethereal?: boolean | undefined
}

export class CursorController {
  readonly metadata: CursorAtlasMetadata
  mouseX: number = 0
  mouseY: number = 0
  lastActivityTime: number = 0
  lastNowMs: number = 0
  private lastUpdateNowMs: number = NaN
  state: CursorState = 'POINTING'

  /** 8.8 fixed-point counters for frame progression and release rewind per D2Client.dll 0x6fac647c..0x6fac68e3 */
  fixedPointCounter: number = 0
  releaseCounter: number = 0

  /**
   * Active D2Client.dll `buysell.dc6` cursor override (`CursorId = 6` at `0x6fba8558`):
   * - `'buy'` -> frame 3 (`0x6fb3ba30`, `nTradeMode = 2`)
   * - `'sell'` -> frame 4 (`0x6fb3b9f0`, `nTradeMode = 3`)
   * - `'repair'` -> frame 1 (`0x6fb3ba70`, `nTradeMode = 4`)
   * - `'identify'` -> frame 0 (`0x6fb36fb7` / packet `0x3f`)
   * - `null` -> standard hand cursor (`protate` / `ohand` / `orotate`)
   */
  tradeCursorMode: BuySellCursorMode | null = null

  /** Milliseconds of inactivity before transitioning from POINTING to OPENING (D2Client 0x6fac6840 add ecx, 0x1388 = 5000ms). */
  idleThresholdMs: number = 5000

  /** Frame playback duration for looping swaying animations (protate & orotate). */
  frameDurationMs: number = 125 // 8 FPS

  /** Frame playback duration for one-shot finger-to-palm opening transition (ohand). */
  openingFrameDurationMs: number = 125 // 8 frames * 125ms = 1000ms total opening time

  constructor(metadata: CursorAtlasMetadata = CURSOR_METADATA, initialTimeMs: number = 0) {
    this.metadata = metadata
    this.lastActivityTime = initialTimeMs
    this.lastNowMs = initialTimeMs
  }

  /**
   * Sets or clears the `buysell.dc6` cursor mode (`'buy' | 'sell' | 'repair' | 'identify' | null`).
   */
  setTradeCursorMode(mode: BuySellCursorMode | null, nowMs: number = this.lastNowMs): void {
    if (this.tradeCursorMode !== mode) {
      this.tradeCursorMode = mode
      this.resetIdle(nowMs)
    }
  }

  /**
   * Resets the idle timer and reverts state immediately to POINTING.
   */
  resetIdle(nowMs: number = performance.now()): void {
    this.lastActivityTime = nowMs
    this.lastNowMs = nowMs
    this.lastUpdateNowMs = NaN
    this.state = 'POINTING'
    this.fixedPointCounter = 0
    this.releaseCounter = 0
  }

  /**
   * Updates cursor position and resets the idle timer.
   * If hand is open, transitions to RELEASE state to play ohand in reverse.
   */
  handleMouseMove(x: number, y: number, nowMs: number = performance.now()): void {
    this.mouseX = x
    this.mouseY = y
    this.lastUpdateNowMs = NaN
    if (this.state === 'OPEN_IDLE') {
      this.state = 'RELEASE'
      this.releaseCounter = (8 << 8) - 0x100
      this.lastActivityTime = nowMs
      this.lastNowMs = nowMs
      return
    }
    if (this.state === 'OPENING') {
      this.state = 'RELEASE'
      this.releaseCounter = Math.min((8 << 8) - 0x100, Math.max(0, this.fixedPointCounter))
      this.lastActivityTime = nowMs
      this.lastNowMs = nowMs
      return
    }
    if (this.state === 'RELEASE') {
      this.lastActivityTime = nowMs
      this.lastNowMs = nowMs
      return
    }
    this.resetIdle(nowMs)
  }

  /**
   * Mouse down event handler; transitions to CLICK_DOWN state.
   */
  handleMouseDown(nowMs: number = performance.now()): void {
    this.lastActivityTime = nowMs
    this.lastNowMs = nowMs
    this.lastUpdateNowMs = NaN
    if (this.tradeCursorMode === null) {
      this.state = 'CLICK_DOWN'
    }
  }

  /**
   * Mouse up event handler; reverts from CLICK_DOWN to POINTING.
   */
  handleMouseUp(nowMs: number = performance.now()): void {
    this.lastActivityTime = nowMs
    this.lastNowMs = nowMs
    this.lastUpdateNowMs = NaN
    if (this.state === 'CLICK_DOWN') {
      this.state = 'POINTING'
    }
  }

  /**
   * Evaluates the state machine transitions based on elapsed idle time and 8.8 fixed-point timers.
   */
  update(nowMs: number = performance.now()): CursorState {
    this.lastNowMs = nowMs
    this.lastUpdateNowMs = nowMs
    if (this.tradeCursorMode !== null) {
      this.state = 'POINTING'
      return this.state
    }

    if (this.state === 'CLICK_DOWN') {
      return this.state
    }

    if (this.state === 'RELEASE') {
      this.releaseCounter -= 0x40
      if (this.releaseCounter <= 0) {
        this.releaseCounter = 0
        this.state = 'POINTING'
        this.lastActivityTime = nowMs
      }
      return this.state
    }

    const idleMs = Math.max(0, nowMs - this.lastActivityTime)
    const openingTotalMs = 8 * this.openingFrameDurationMs

    if (idleMs < this.idleThresholdMs) {
      this.state = 'POINTING'
      this.fixedPointCounter = 0
    } else if (idleMs < this.idleThresholdMs + openingTotalMs) {
      this.state = 'OPENING'
      const openingElapsed = idleMs - this.idleThresholdMs
      const frameIdx = Math.min(7, Math.floor(openingElapsed / this.openingFrameDurationMs))
      const frac = Math.floor(((openingElapsed % this.openingFrameDurationMs) / this.openingFrameDurationMs) * 0x100)
      this.fixedPointCounter = (frameIdx << 8) + frac
    } else {
      this.state = 'OPEN_IDLE'
      this.fixedPointCounter = 8 << 8
    }

    return this.state
  }

  /**
   * Computes the current active animation, frame index, drawing coordinates, and bounds.
   */
  getCurrentFrame(nowMs: number = performance.now()): CursorRenderInfo {
    if (nowMs !== this.lastUpdateNowMs) {
      this.update(nowMs)
    }

    let anim: CursorAnimation
    let frameIndex: number
    let frameMeta: CursorFrameMeta

    if (this.tradeCursorMode !== null) {
      anim = 'buysell'
      frameIndex = BUYSELL_CURSOR_FRAMES[this.tradeCursorMode]
      const buysellFrame = this.metadata.buysell?.[frameIndex]
      if (!buysellFrame) {
        throw new Error(`Missing buysell cursor frame ${frameIndex} for mode '${this.tradeCursorMode}'`)
      }
      frameMeta = buysellFrame
    } else {
      const idleMs = Math.max(0, nowMs - this.lastActivityTime)
      const openingTotalMs = 8 * this.openingFrameDurationMs

      if (this.state === 'POINTING' || this.state === 'CLICK_DOWN') {
        anim = 'protate'
        if (this.state === 'CLICK_DOWN') {
          frameIndex = 0
        } else {
          // Looping pointing hand swaying animation driven by animation clock
          const safeClock = Math.max(0, nowMs)
          frameIndex = Math.floor(safeClock / this.frameDurationMs) % 8
        }
      } else if (this.state === 'RELEASE') {
        anim = 'ohand'
        frameIndex = Math.min(7, Math.max(0, this.releaseCounter >> 8))
      } else if (this.state === 'OPENING') {
        anim = 'ohand'
        // Plays ohand 8 frames sequentially
        const openingElapsed = Math.max(0, idleMs - this.idleThresholdMs)
        frameIndex = Math.min(7, Math.max(0, Math.floor(openingElapsed / this.openingFrameDurationMs)))
      } else {
        anim = 'orotate'
        // Open palm swaying idle animation loops 8 frames
        const openIdleElapsed = Math.max(0, idleMs - this.idleThresholdMs - openingTotalMs)
        frameIndex = Math.floor(openIdleElapsed / this.frameDurationMs) % 8
      }

      if (frameIndex < 0 || isNaN(frameIndex)) {
        frameIndex = 0
      }

      const frameList = this.metadata[anim]
      if (!frameList || frameList.length === 0) {
        throw new Error(`Missing cursor animation sequence '${anim}' in cursor metadata`)
      }
      const frame = frameList[frameIndex]
      if (!frame) {
        throw new Error(`Missing cursor frame index ${frameIndex} for animation '${anim}'`)
      }
      frameMeta = frame
    }

    const drawX = Math.round(this.mouseX - frameMeta.hotspotX)
    const drawY = Math.round(this.mouseY - frameMeta.hotspotY)

    return {
      state: this.state,
      animation: anim,
      frameIndex,
      frame: frameMeta,
      drawX,
      drawY,
      hotspotX: frameMeta.hotspotX,
      hotspotY: frameMeta.hotspotY,
      bounds: {
        x: drawX,
        y: drawY,
        width: frameMeta.w,
        height: frameMeta.h,
      },
    }
  }

  /**
   * Returns current cursor rendering bounds.
   */
  getRenderBounds(nowMs: number = performance.now()): { x: number; y: number; width: number; height: number } {
    return this.getCurrentFrame(nowMs).bounds
  }

  /**
   * Renders the cursor (or held item) to the 2D context.
   */
  render(
    ctx: CanvasRenderingContext2D,
    cursorAtlas: CanvasImageSource | null,
    nowMs: number = performance.now(),
    heldItem?: HeldItemRenderInfo | null,
  ): void {
    this.update(nowMs)

    // When an item is held on cursor, render the item centered at cursor hotspot
    if (heldItem && heldItem.atlas && heldItem.rect) {
      const sr = heldItem.rect
      const dx = Math.round(this.mouseX - sr.w / 2)
      const dy = Math.round(this.mouseY - sr.h / 2)
      drawImageWithEtherealAlpha(ctx, Boolean(heldItem.ethereal), () => {
        ctx.drawImage(heldItem.atlas, sr.x, sr.y, sr.w, sr.h, dx, dy, sr.w, sr.h)
      })
      return
    }

    // Otherwise, render the authentic animated hand cursor or buysell trade cursor
    if (!cursorAtlas) {
      reportMissingArt('ui-cursor', 'cursorAtlas', `state=${this.state}`)
      return
    }

    const info = this.getCurrentFrame(nowMs)
    ctx.drawImage(
      cursorAtlas,
      info.frame.x,
      info.frame.y,
      info.frame.w,
      info.frame.h,
      info.drawX,
      info.drawY,
      info.frame.w,
      info.frame.h,
    )
  }
}
