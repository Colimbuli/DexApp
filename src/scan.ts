import { createWorker, type Worker } from 'tesseract.js'
import { parseOcr, type ParsedOcr } from './ocr'

let workerPromise: Promise<Worker> | undefined

function getWorker(onStatus?: (s: string) => void): Promise<Worker> {
  workerPromise ??= createWorker('deu+eng', 1, {
    logger: (m) => onStatus?.(`${m.status} ${Math.round((m.progress ?? 0) * 100)} %`),
  })
  return workerPromise
}

/** Schneidet einen horizontalen Streifen aus, skaliert auf Zielbreite und erhöht den Kontrast. */
function band(src: CanvasImageSource, w: number, h: number, y0: number, y1: number, targetW: number): HTMLCanvasElement {
  const sy = Math.floor(h * y0)
  const sh = Math.max(1, Math.floor(h * (y1 - y0)))
  const scale = targetW / w
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale)
  c.height = Math.max(1, Math.round(sh * scale))
  const ctx = c.getContext('2d')!
  ctx.filter = 'grayscale(1) contrast(1.6)'
  ctx.drawImage(src, 0, sy, w, sh, 0, 0, c.width, c.height)
  return c
}

export interface ScanResult {
  parsed: ParsedOcr
  /** Vorschaubilder der gelesenen Ausschnitte (Diagnose) */
  debug: { label: string; url: string; text: string }[]
}

/**
 * Liest Namen (oberer Streifen) und Nummer (unterer Streifen).
 * Findet sich dort nichts, wird das ganze Bild gelesen.
 */
export async function scanCanvas(
  src: CanvasImageSource,
  w: number,
  h: number,
  onStatus?: (s: string) => void,
): Promise<ScanResult> {
  const worker = await getWorker(onStatus)
  const debug: ScanResult['debug'] = []
  const read = async (label: string, c: HTMLCanvasElement) => {
    onStatus?.(`${label} lesen …`)
    const text = (await worker.recognize(c)).data.text
    debug.push({ label, url: c.toDataURL('image/jpeg', 0.6), text: text.trim() })
    return text
  }

  const top = await read('Name', band(src, w, h, 0, 0.16, 1600))
  const bottom = await read('Nummer', band(src, w, h, 0.86, 1, 1600))
  const parsed = parseOcr(top, bottom)

  if (!parsed.names.length || parsed.number === undefined) {
    const full = await read('Ganzes Bild', band(src, w, h, 0, 1, Math.min(1600, Math.max(w, 1000))))
    const p2 = parseOcr(full, full)
    if (!parsed.names.length) parsed.names = p2.names
    if (parsed.number === undefined) {
      parsed.number = p2.number
      parsed.total = p2.total
      parsed.promoCode = p2.promoCode
    }
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
