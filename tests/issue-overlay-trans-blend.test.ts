/**
 * Overlay.txt `Trans` draw levels must map to authentic D2Gfx transparency modes.
 *
 * Ground truth: the Trans column is a D2Gfx.dll transparency LEVEL
 * (0 none / 1 50% / 2 25% / 3 screen-additive / 4 75% / 5 modulate), NOT an
 * index into the D2MOO DrawMode enum. 284 of 293 compiled overlay.bin rows are
 * Trans 3 (additive glow) — the previous scrambled mapping rendered them at
 * 50% opacity, washing out every skill-cast overlay (user-reported: the
 * sorceress cast fire looked translucent vs vanilla).
 */
import { describe, expect, it } from 'vitest'
import {
  overlayTransToBlendMode,
  transToBlendMode,
} from '../src/client/view/unit-drawables.ts'
import { OVERLAY_TXT_ROWS } from '../src/client/render/overlay-txt-rows.ts'

describe('[overlay trans blend] Overlay.txt Trans draw-level mapping', () => {
  it('1. maps D2Gfx transparency levels to authentic draw modes', () => {
    expect(overlayTransToBlendMode(0)).toBe('normal')
    expect(overlayTransToBlendMode(1)).toBe('trans50')
    expect(overlayTransToBlendMode(2)).toBe('trans25')
    expect(overlayTransToBlendMode(3)).toBe('highlight')
    expect(overlayTransToBlendMode(4)).toBe('trans75')
    expect(overlayTransToBlendMode(5)).toBe('modulate')
    expect(overlayTransToBlendMode(undefined)).toBe('normal')
  })

  it('2. compiled overlay.bin: fire_cast_2 (sorceress cast fire) is Trans 3 → additive', () => {
    const fireCast2 = OVERLAY_TXT_ROWS.find(r => r.name === 'fire_cast_2')
    expect(fireCast2).toBeDefined()
    expect(fireCast2!.trans).toBe(3)
    expect(overlayTransToBlendMode(fireCast2!.trans)).toBe('highlight')
  })

  it('3. the bulk of vanilla overlays are Trans 3 and must not render 50% translucent', () => {
    const trans3 = OVERLAY_TXT_ROWS.filter(r => r.trans === 3).length
    expect(trans3).toBeGreaterThanOrEqual(280)
  })

  it('4. Missiles.txt-side mapping stays additive for Trans 1 (AGENTS §4.4)', () => {
    expect(transToBlendMode(1)).toBe('highlight')
  })
})
