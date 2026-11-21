import { useEffect, useRef, useState } from 'react'

const EVENT = 'open-image'

/** Kartenbild im Vollbild öffnen (hohe Auflösung, falls verfügbar). */
export function openImage(url?: string) {
  if (url) window.dispatchEvent(new CustomEvent(EVENT, { detail: url }))
}

export const highRes = (url: string) => url.replace(/\/low\.webp$/, '/high.webp')

export function ImageViewer() {
  const ref = useRef<HTMLDialogElement>(null)
  const [url, setUrl] = useState<string>()
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const onOpen = (e: Event) => {
      setFallback(false)
      setUrl((e as CustomEvent<string>).detail)
      // Zurück-Taste schließt das Vollbild statt die Seite zu verlassen
      history.pushState({ imageViewer: true }, '')
    }
    const onPop = () => setUrl(undefined)
    window.addEventListener(EVENT, onOpen)
    window.addEventListener('popstate', onPop)
    return () => { window.removeEventListener(EVENT, onOpen); window.removeEventListener('popstate', onPop) }
  }, [])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (url && !d.open) d.showModal()
    if (!url && d.open) d.close()
  }, [url])

  const close = () => { if (history.state?.imageViewer) history.back(); else setUrl(undefined) }

  return (
    <dialog ref={ref} className="viewer" onClick={close} onCancel={(e) => { e.preventDefault(); close() }}>
      {url && <img src={fallback ? url : highRes(url)} alt="Karte im Vollbild" onError={() => setFallback(true)} />}
    </dialog>
  )
}
