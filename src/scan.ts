import { createWorker, type Worker } from 'tesseract.js'
import { parseOcr, type ParsedOcr } from './ocr'

let workerPromise: Promise<Worker> | undefined

function getWorker(onStatus?: (s: string) => void): Promise<Worker> {
  workerPromise ??= createWorker('deu', 1, {
    logger: (m) => onStatus?.(`${m.status} ${Math.round((m.progress ?? 0) * 100)} %`),
  })
  return workerPromise
}

/** Schneidet einen horizontalen Streifen aus, skaliert hoch und erhöht den Kontrast. */
function band(src: CanvasImageSource, w: number, h: number, y0: number, y1: number): HTMLCanvasElement {
  const sy = Math.floor(h * y0)
  const sh = Math.max(1, Math.floor(h * (y1 - y0)))
  const scale = Math.max(1, 1600 / w)
  const c = document.createElement('canvas')
  c.width = Math.floor(w * scale)
  c.height = Math.floor(sh * scale)
  const ctx = c.getContext('2d')!
  ctx.filter = 'grayscale(1) contrast(1.6)'
  ctx.drawImage(src, 0, sy, w, sh, 0, 0, c.width, c.height)
  return c
}

/** Erwartet ein Bild, in dem die Karte (Hochformat) das Bild weitgehend füllt. */
export async function scanCanvas(
  src: CanvasImageSource,
  w: number,
  h: number,
  onStatus?: (s: string) => void,
): Promise<ParsedOcr> {
  const worker = await getWorker(onStatus)
  onStatus?.('Name lesen …')
  const top = (await worker.recognize(band(src, w, h, 0, 0.16))).data.text
  onStatus?.('Nummer lesen …')
  const bottom = (await worker.recognize(band(src, w, h, 0.86, 1))).data.text
  return parseOcr(top, bottom)
}

export async function fileToCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; w: number; h: number }> {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  return { canvas: c, w: c.width, h: c.height }
}
