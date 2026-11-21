import { useState } from 'react'
import { findCards } from './tcgdex'
import type { CardInfo } from './types'
import { Results } from './Results'

export function Search({ onPick }: { onPick: (c: CardInfo) => void }) {
  const [name, setName] = useState('')
  const [nr, setNr] = useState('')
  const [cards, setCards] = useState<CardInfo[]>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function go() {
    if (!name.trim()) return
    setBusy(true); setErr('')
    try {
      const n = parseInt(nr, 10)
      setCards(await findCards({ names: [name], number: isNaN(n) ? undefined : n }, 20))
    } catch (e) {
      setErr('Suche fehlgeschlagen – Internetverbindung prüfen. ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <main>
      <h1>Suche</h1>
      <form onSubmit={(e) => { e.preventDefault(); go() }}>
        <label>Kartenname (deutsch)</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Glurak" />
        <label>Sammlernummer (optional)</label>
        <input value={nr} inputMode="numeric" onChange={(e) => setNr(e.target.value)} placeholder="z. B. 25" />
        <button className="primary" disabled={busy} style={{ marginTop: 10, width: '100%' }}>{busy ? 'Suche …' : 'Suchen'}</button>
      </form>
      {err && <p className="err">{err}</p>}
      {cards && cards.length === 0 && <p className="muted">Keine Treffer.</p>}
      {cards && <div style={{ marginTop: 12 }}><Results cards={cards} onPick={onPick} /></div>}
    </main>
  )
}
