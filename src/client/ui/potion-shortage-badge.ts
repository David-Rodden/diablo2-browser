import { drawFramedBadge } from './framed-badge.ts'
import type { D2FontRenderer } from './font.ts'

const CENTER_X = 65
const BASELINE_Y = 500
const PADDING = 12

export type PotionShortageKind = 'life' | 'mana'

export const potionShortageLabel = (kind: PotionShortageKind, lang: 'ENG' | 'CHI'): string =>
  lang === 'ENG' ? `No ${kind === 'life' ? 'healing' : 'mana'} potions` : `没有${kind === 'life' ? '治疗' : '法力'}药剂`

export function drawPotionShortageBadge(ctx: CanvasRenderingContext2D, font: D2FontRenderer, kind: PotionShortageKind, offsetX: number, offsetY: number, lang: 'ENG' | 'CHI'): void {
  const label = potionShortageLabel(kind, lang)
  drawFramedBadge(ctx, font, label, offsetX + CENTER_X, offsetY + BASELINE_Y, font.measureText(label, 'font8') + PADDING, '#8c3030', 'red')
}
