export const CARD_ASPECT = 63 / 88

export interface Rect { x: number; y: number; w: number; h: number }

/** Größtes mittiges Karten-Rechteck (63:88), das mit Rand ins Bild passt – Hoch- wie Querformat. */
export function cardRect(w: number, h: number, fill = 0.9): Rect {
  const ch = Math.min(h * fill, (w * fill) / CARD_ASPECT)
  const cw = ch * CARD_ASPECT
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch }
}
