import { createWorker, PSM, type Worker } from 'tesseract.js'
import { numberMatches, parseOcr, vote, type ParsedOcr } from './ocr'
import { CARD_ASPECT, type Rect } from './geometry'

interface Bbox { x0: number; y0: number; x1: number; y1: number }

let workerPromise: Promise<Worker> | undefined

function getWorker(onStatus?: (s: string) => void): Promise<Worker> {
  workerPromise ??= createWorker('deu+eng', 1, {
    logger: (m) => onStatus?.(`${m.status} ${Math.round((m.progress ?? 0) * 100)} %`),
  })
  return workerPromise
}

/**
 * Lokale (adaptive) Binarisierung: Pixel wird schwarz, wenn er um mehr als `c`
 * dunkler ist als der Mittelwert seiner Umgebung (Radius r). Entfernt Farbverläufe
 * und körnigen Kartenhintergrund, die die Texterkennung sonst stören.
 */
export function adaptiveThreshold(gray: Uint8ClampedArray | number[], w: number, h: number, r: number, c: number): Uint8Array {
  const W = w + 1
  const integral = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row
    }
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1)
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0]
      const mean = sum / ((y1 - y0) * (x1 - x0))
      out[y * w + x] = mean - gray[y * w + x] > c ? 0 : 255
    }
  }
  return out
}

/** Schneidet einen Bereich aus, skaliert auf Zielbreite, Graustufen + adaptive Binarisierung. */
function band(
  src: CanvasImageSource, w: number, h: number, y0: number, y1: number, targetW: number, x0 = 0, x1 = 1, binarize = true,
): HTMLCanvasElement {
  const sy = Math.floor(h * y0)
  const sh = Math.max(1, Math.floor(h * (y1 - y0)))
  const sx = Math.floor(w * x0)
  const sw = Math.max(1, Math.floor(w * (x1 - x0)))
  const scale = targetW / sw
  const c = document.createElement('canvas')
  c.width = Math.round(sw * scale)
  c.height = Math.max(1, Math.round(sh * scale))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.filter = binarize ? 'grayscale(1)' : 'grayscale(1) contrast(1.6)'
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height)
  if (binarize) {
    const img = ctx.getImageData(0, 0, c.width, c.height)
    const d = img.data
    const gray = new Uint8ClampedArray(c.width * c.height)
    for (let i = 0; i < gray.length; i++) gray[i] = d[i * 4]
    const bin = adaptiveThreshold(gray, c.width, c.height, Math.max(8, Math.round(c.width / 32)), 25)
    for (let i = 0; i < bin.length; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = bin[i]; d[i * 4 + 3] = 255 }
    ctx.putImageData(img, 0, 0)
  }
  return c
}

function crop(src: CanvasImageSource, r: Rect): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.round(r.w)
  c.height = Math.round(r.h)
  c.getContext('2d')!.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height)
  return c
}

/** Bereich, den die Karte im Bild einnimmt – geschätzt aus den Positionen sicher erkannter Wörter. */
export function cardFromWords(words: { text: string; confidence: number; bbox: Bbox }[], w: number, h: number): Rect | undefined {
  const good = words.filter((x) => x.confidence >= 60 && x.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 3)
  if (good.length < 4) return undefined
  const x0 = Math.min(...good.map((x) => x.bbox.x0))
  const x1 = Math.max(...good.map((x) => x.bbox.x1))
  const y0 = Math.min(...good.map((x) => x.bbox.y0))
  const y1 = Math.max(...good.map((x) => x.bbox.y1))
  // Text deckt ca. 88 % der Breite und 90 % der Höhe einer Karte ab
  const ch = Math.max((y1 - y0) / 0.9, (x1 - x0) / 0.88 / CARD_ASPECT)
  const cw = ch * CARD_ASPECT
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const r = { x: Math.max(0, cx - cw / 2), y: Math.max(0, cy - ch / 2), w: 0, h: 0 }
  r.w = Math.min(w, cx + cw / 2) - r.x
  r.h = Math.min(h, cy + ch / 2) - r.y
  // lohnt nur, wenn die Karte deutlich kleiner als das Bild ist
  return r.w * r.h < 0.8 * w * h ? r : undefined
}

export interface ScanResult {
  parsed: ParsedOcr
  /** Vorschaubilder der gelesenen Ausschnitte (Diagnose) */
  debug: { label: string; url: string; text: string }[]
}

/**
 * Nummernbereiche (relativ zur Karte). Moderne Karten: unten links, ältere: unten rechts.
 * Mehrere leicht versetzte Ausschnitte, weil die Erkennung bei der kleinen kursiven
 * Schrift auf körnigem Grund je nach Ausschnitt mal liest, mal nicht.
 */
const NUMBER_CROPS: [string, number, number, number, number][] = [
  ['Nummer L1', 0.89, 1, 0, 0.55],
  ['Nummer L2', 0.86, 1, 0, 0.55],
  ['Nummer L3', 0.91, 0.99, 0, 0.45],
  ['Nummer R1', 0.89, 1, 0.45, 1],
  ['Nummer R2', 0.86, 1, 0.45, 1],
]

/**
 * Liest eine Karte.
 * - locate=true (Foto): zuerst ganzes Bild lesen, Karte darin finden, dann deren Bereiche lesen
 * - locate=false (Kamerarahmen): Bild ist bereits die Karte; ganzes Bild nur als Rückfallebene
 */
export async function scanCanvas(
  src: CanvasImageSource,
  w: number,
  h: number,
  onStatus?: (s: string) => void,
  locate = false,
): Promise<ScanResult> {
  const worker = await getWorker(onStatus)
  const debug: ScanResult['debug'] = []
  const read = async (label: string, c: HTMLCanvasElement) => {
    onStatus?.(`${label} lesen …`)
    const text = (await worker.recognize(c)).data.text
    debug.push({ label, url: c.toDataURL('image/jpeg', 0.6), text: text.trim() })
    return text
  }

  const readFull = async () => {
    onStatus?.('Ganzes Bild lesen …')
    const c = band(src, w, h, 0, 1, Math.min(1600, Math.max(w, 1000)), 0, 1, false)
    const res = await worker.recognize(c, {}, { text: true, blocks: true })
    debug.push({ label: 'Ganzes Bild', url: c.toDataURL('image/jpeg', 0.6), text: res.data.text.trim() })
    const k = w / c.width
    const words = (res.data.blocks ?? [])
      .flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
      .map((x) => ({ ...x, bbox: { x0: x.bbox.x0 * k, x1: x.bbox.x1 * k, y0: x.bbox.y0 * k, y1: x.bbox.y1 * k } }))
    return { text: res.data.text, rect: cardFromWords(words, w, h) }
  }

  const readCard = async (s: CanvasImageSource, sw: number, sh: number, prefix = '') => {
    // Name: Zielbreite 1000 – größer verschlechtert die Erkennung der großen Titelschrift
    const top = await read(prefix + 'Name', band(s, sw, sh, 0, 0.22, 1000))
    const parsed = parseOcr(top, '')
    // Nummer: Modus „verstreuter Text“ (PSM 11), mehrere Ausschnitte, Mehrheitsentscheid
    const reads: { number: number; total: number }[] = []
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    try {
      for (const [label, y0, y1, x0, x1] of NUMBER_CROPS) {
        reads.push(...numberMatches(await read(prefix + label, band(s, sw, sh, y0, y1, 800, x0, x1))))
        const v = vote(reads)
        // sicher genug: eine Lesung zweimal gesehen
        if (v[0]?.votes >= 2) break
      }
    } finally {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    }
    parsed.candidates = vote(reads)
    if (parsed.candidates[0]) {
      parsed.number = parsed.candidates[0].number
      parsed.total = parsed.candidates[0].total
    }
    return parsed
  }

  let parsed: ParsedOcr
  let fullText: string | undefined

  if (locate) {
    const full = await readFull()
    fullText = full.text
    if (full.rect) {
      const card = crop(src, full.rect)
      parsed = await readCard(card, card.width, card.height, 'Karte: ')
    } else {
      parsed = await readCard(src, w, h)
    }
  } else {
    parsed = await readCard(src, w, h)
    if (!parsed.names.length || parsed.number === undefined) fullText = (await readFull()).text
  }

  // Rückfallebene: was im Ganzbild-Text steht
  if (fullText !== undefined) {
    const p2 = parseOcr(fullText, fullText)
    if (!parsed.names.length) parsed.names = p2.names
    if (parsed.number === undefined) {
      parsed.number = p2.number
      parsed.total = p2.total
      parsed.promoCode = p2.promoCode
    }
    const extra = numberMatches(fullText)
    if (extra.length) parsed.candidates = vote([...(parsed.candidates ?? []).flatMap((c) => Array(c.votes).fill(c)), ...extra])
  }
  return { parsed, debug }
}

export async function fileToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  bmp.close()
  return { canvas: c, w: c.width, h: c.height }
}
