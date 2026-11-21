import { useState } from 'react'
import { findCards } from './tcgdex'
import type { CardInfo } from './types'
import { Results } from './Results'
import { LangSelect, useLangChoice } from './LangSelect'

/** „25“, „025/159“, „25 / 159“ → Nummer und optional Gesamtzahl */
export function parseNumberInput(s: string): { number?: number; total?: number } {
  const m = s.match(/(\d{1,3})\s*(?:\/\s*(\d{1,3}))?/)
  if (!m) return {}
  return { number: parseInt(m[1], 10), total: m[2] ? parseInt(m[2], 10) : undefined }
}

export function Search({ onPick }: { onPick: (c: CardInfo) => void }) {
  const [name, setName] = useState('')
  const [nr, setNr] = useState('')
  const [cards, setCards] = useState<CardInfo[]>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lang, setLang] = useLangChoice()

  async function go() {
    const { number, total } = parseNumberInput(nr)
    if (!name.trim() && total === undefined) return setErr('Name oder Nummer mit Gesamtzahl (z. B. 025/159) eingeben.')
    setBusy(true); setErr('')
    try {
      setCards(await findCards({ names: name.trim() ? [name.trim()] : [], number, total, lang }, 20))
    } catch (e) {
      setErr('Suche fehlgeschlagen – Internetverbindung prüfen. ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <main>
      <h1>Suche</h1>
      <LangSelect value={lang} onChange={setLang} />
      <form onSubmit={(e) => { e.preventDefault(); go() }}>
        <label>Kartenname</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Glurak / Charizard" />
        <label>Sammlernummer (optional, mit „/Gesamt“ auch ohne Namen)</label>
        <input value={nr} inputMode="text" autoComplete="off" onChange={(e) => setNr(e.target.value)} placeholder="z. B. 25 oder 025/159" />
        <button className="primary" disabled={busy} style={{ marginTop: 10, width: '100%' }}>{busy ? 'Suche …' : 'Suchen'}</button>
      </form>
      {err && <p className="err">{err}</p>}
      {cards && cards.length === 0 && <p className="muted">Keine Treffer.</p>}
      {cards && <div style={{ marginTop: 12 }}><Results cards={cards} onPick={onPick} /></div>}
    </main>
  )
}
