import { useEffect, useRef, useState } from 'react'
import { fileToCanvas, scanCanvas, type ScanResult } from './scan'
import { cardRect, type Rect } from './geometry'
import { findCards } from './tcgdex'
import type { CardInfo } from './types'
import type { ParsedOcr } from './ocr'
import { Results } from './Results'

export function Scanner({ onPick }: { onPick: (c: CardInfo) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | undefined>(undefined)
  const [camOn, setCamOn] = useState(false)
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')
  const [parsed, setParsed] = useState<ParsedOcr>()
  const [cards, setCards] = useState<CardInfo[]>()
  const [busy, setBusy] = useState(false)
  const [debug, setDebug] = useState<ScanResult['debug']>()
  const [frame, setFrame] = useState<Rect>()

  function updateFrame() {
    const v = video.current
    if (!v?.videoWidth) return
    const r = cardRect(v.videoWidth, v.videoHeight)
    setFrame({ x: r.x / v.videoWidth, y: r.y / v.videoHeight, w: r.w / v.videoWidth, h: r.h / v.videoHeight })
  }

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), [])

  async function startCam() {
    setErr('')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      setCamOn(true)
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = stream.current!; video.current.play() } })
    } catch {
      setErr('Kamera nicht verfügbar oder verweigert. Alternativ ein Foto auswählen.')
    }
  }

  function stopCam() {
    stream.current?.getTracks().forEach((t) => t.stop())
    setCamOn(false)
  }

  async function process(src: CanvasImageSource, w: number, h: number) {
    setBusy(true); setErr(''); setCards(undefined); setParsed(undefined); setDebug(undefined)
    try {
      const { parsed: p, debug: d } = await scanCanvas(src, w, h, setStatus)
      setParsed(p)
      setDebug(d)
      if (!p.names.length) { setErr('Kein Kartenname erkannt. Näher ran, besser beleuchten, Reflexe vermeiden – oder die Suche nutzen.'); return }
      setStatus('Suche Karte …')
      setCards(await findCards({ names: p.names, number: p.number, total: p.total, promoCode: p.promoCode }))
    } catch (e) {
      setErr('Fehler: ' + (e as Error).message + ' (Scan braucht Internet für Texterkennung und Kartendaten)')
    } finally { setBusy(false); setStatus('') }
  }

  async function snap() {
    const v = video.current
    if (!v || !v.videoWidth) return
    // Ausschnitt = gelber Kartenrahmen, passt in Hoch- und Querformat
    const { x: sx, y: sy, w: cw, h: ch } = cardRect(v.videoWidth, v.videoHeight)
    const c = document.createElement('canvas')
    c.width = Math.round(cw); c.height = Math.round(ch)
    c.getContext('2d')!.drawImage(v, sx, sy, cw, ch, 0, 0, c.width, c.height)
    await process(c, c.width, c.height)
  }

  async function onFile(f?: File) {
    if (!f) return
    const { canvas, w, h } = await fileToCanvas(f)
    await process(canvas, w, h)
  }

  return (
    <main>
      <h1>Scannen</h1>
      {camOn ? (
        <>
          <div className="cam">
            <video ref={video} playsInline muted onLoadedMetadata={updateFrame} onResize={updateFrame} />
            {frame && (
              <div className="frame" style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.w * 100}%`, height: `${frame.h * 100}%` }} />
            )}
          </div>
          <p className="muted">Karte formatfüllend im gelben Rahmen ausrichten, gut ausleuchten, Reflexe vermeiden.</p>
          <div className="row">
            <button className="primary" onClick={snap} disabled={busy}>{busy ? status || 'Lese …' : 'Aufnehmen'}</button>
            <button onClick={stopCam}>Kamera aus</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="primary" onClick={startCam}>Kamera starten</button>
          <label className="muted" style={{ margin: 0, flex: 1 }}>
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <span style={{ display: 'block', background: 'var(--panel2)', color: 'var(--text)', padding: '10px 14px', borderRadius: 8, textAlign: 'center', cursor: 'pointer' }}>Foto wählen</span>
          </label>
        </div>
      )}
      {!camOn && busy && <p className="muted">{status || 'Lese …'}</p>}
      {err && <p className="err">{err}</p>}
      {parsed && (
        <p className="muted">
          Erkannt: {parsed.names.slice(0, 3).join(', ') || '–'}
          {parsed.number !== undefined ? ` · Nr. ${parsed.number}${parsed.total ? `/${parsed.total}` : ''}` : ' · keine Nummer'}
        </p>
      )}
      {cards && cards.length === 0 && <p className="muted">Keine Treffer – bitte die manuelle Suche nutzen.</p>}
      {cards && <Results cards={cards} onPick={onPick} />}
      {debug && (
        <details className="debug" open={!cards?.length}>
          <summary className="muted">Gelesene Ausschnitte (Diagnose)</summary>
          {debug.map((d) => (
            <div key={d.label} className="card">
              <div className="muted">{d.label}</div>
              <img src={d.url} alt={d.label} />
              <pre>{d.text || '(kein Text erkannt)'}</pre>
            </div>
          ))}
        </details>
      )}
    </main>
  )
}
