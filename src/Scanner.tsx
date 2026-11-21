import { useEffect, useRef, useState } from 'react'
import { fileToCanvas, scanCanvas } from './scan'
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
    setBusy(true); setErr(''); setCards(undefined); setParsed(undefined)
    try {
      const p = await scanCanvas(src, w, h, setStatus)
      setParsed(p)
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
    // Ausschnitt = Kartenrahmen (Seitenverhältnis 63:88, 92 % der Bildhöhe, mittig)
    const ch = v.videoHeight * 0.92
    const cw = ch * (63 / 88)
    const sx = (v.videoWidth - cw) / 2
    const sy = (v.videoHeight - ch) / 2
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
            <video ref={video} playsInline muted />
            <div className="frame" />
          </div>
          <p className="muted">Karte im Rahmen ausrichten, gut ausleuchten, Reflexe vermeiden.</p>
          <div className="row">
            <button className="primary" onClick={snap} disabled={busy}>{busy ? status || 'Lese …' : 'Aufnehmen'}</button>
            <button onClick={stopCam}>Kamera aus</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="primary" onClick={startCam}>Kamera starten</button>
          <label className="muted" style={{ margin: 0, flex: 1 }}>
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
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
    </main>
  )
}
