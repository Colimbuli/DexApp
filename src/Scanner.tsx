import { useEffect, useRef, useState } from 'react'
import { fileToCanvas, scanCanvas, type ScanResult } from './scan'
import { cardRect, type Rect } from './geometry'
import { findCards } from './tcgdex'
import type { CardInfo } from './types'
import type { ParsedOcr } from './ocr'
import { Results } from './Results'
import { LangSelect, useLangChoice } from './LangSelect'
import { pickMainCamera, rearCameras, saveCameraId, savedCameraId } from './camera'

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
  const [lang, setLang] = useLangChoice()
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [camId, setCamId] = useState<string>()

  function updateFrame() {
    const v = video.current
    if (!v?.videoWidth) return
    const r = cardRect(v.videoWidth, v.videoHeight)
    setFrame({ x: r.x / v.videoWidth, y: r.y / v.videoHeight, w: r.w / v.videoWidth, h: r.h / v.videoHeight })
  }

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), [])

  const open = (video: MediaTrackConstraints) =>
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, ...video }, audio: false })

  function attach(s: MediaStream) {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = s
    setCamId(s.getVideoTracks()[0]?.getSettings().deviceId)
    setCamOn(true)
    requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; video.current.play() } })
  }

  async function startCam() {
    setErr('')
    try {
      // 1. irgendeine Rückkamera – nötig, damit der Browser die Kameranamen freigibt
      const first = await open({ facingMode: { ideal: 'environment' } })
      const devices = await navigator.mediaDevices.enumerateDevices()
      const rear = rearCameras(devices)
      setCams(rear)
      // 2. gezielt die Hauptkamera öffnen, falls der Browser eine andere gewählt hat
      const main = pickMainCamera(devices, savedCameraId())
      const current = first.getVideoTracks()[0]?.getSettings().deviceId
      if (main && main.deviceId && main.deviceId !== current) {
        first.getTracks().forEach((t) => t.stop())
        attach(await open({ deviceId: { exact: main.deviceId } }).catch(() => open({ facingMode: { ideal: 'environment' } })))
      } else {
        attach(first)
      }
    } catch {
      setErr('Kamera nicht verfügbar oder verweigert. Alternativ ein Foto auswählen.')
    }
  }

  async function switchCam() {
    if (cams.length < 2) return
    const i = cams.findIndex((c) => c.deviceId === camId)
    const next = cams[(i + 1) % cams.length]
    try {
      stream.current?.getTracks().forEach((t) => t.stop())
      attach(await open({ deviceId: { exact: next.deviceId } }))
      saveCameraId(next.deviceId)
    } catch {
      setErr('Diese Kamera lässt sich nicht öffnen.')
    }
  }

  const camLabel = cams.find((c) => c.deviceId === camId)?.label

  function stopCam() {
    stream.current?.getTracks().forEach((t) => t.stop())
    setCamOn(false)
  }

  async function process(src: CanvasImageSource, w: number, h: number, locate = false) {
    setBusy(true); setErr(''); setCards(undefined); setParsed(undefined); setDebug(undefined)
    try {
      const { parsed: p, debug: d } = await scanCanvas(src, w, h, setStatus, locate)
      setParsed(p)
      setDebug(d)
      if (!p.names.length) { setErr('Kein Kartenname erkannt. Näher ran, besser beleuchten, Reflexe vermeiden – oder die Suche nutzen.'); return }
      setStatus('Suche Karte …')
      setCards(await findCards({ names: p.names, number: p.number, total: p.total, promoCode: p.promoCode, candidates: p.candidates, lang }))
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
    await process(canvas, w, h, true)
  }

  return (
    <main>
      <h1>Scannen</h1>
      <LangSelect value={lang} onChange={setLang} />
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
          {cams.length > 1 && (
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={switchCam} disabled={busy}>Kamera wechseln ({cams.findIndex((c) => c.deviceId === camId) + 1}/{cams.length})</button>
            </div>
          )}
          {camLabel && <p className="muted">{camLabel}</p>}
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
          {(parsed.candidates?.length ?? 0) > 1 && ` (auch gelesen: ${parsed.candidates!.slice(1, 3).map((c) => `${c.number}/${c.total}`).join(', ')})`}
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
