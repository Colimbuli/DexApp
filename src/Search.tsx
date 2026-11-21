import { useState } from 'react'
import { findCards } from './tcgdex'
import type { CardInfo } from './types'
import { Results } from './Results'
import { LangSelect, useLangChoice } from './LangSelect'

/** „25“, „025/159“, „TG05/TG30“, „SWSH062“ → Nummer, Gesamtzahl, Präfix bzw. Promo-Code */
export function parseNumberInput(s: string): { number?: number; total?: number; prefix?: string; promoCode?: string } {
  const t = s.trim().toUpperCase()
  const g = t.match(/^(TG|GG|RC|SV)\s?(\d{1,3})\s*\/\s*(?:TG|GG|RC|SV)?\s?(\d{1,3})$/)
  if (g) return { number: parseInt(g[2], 10), total: parseInt(g[3], 10), prefix: g[1] }
  const p = t.match(/^([A-Z]{2,5})\s?-?(\d{1,3})$/)
  if (p) return { number: parseInt(p[2], 10), promoCode: p[1] + p[2] }
  const m = t.match(/(\d{1,3})\s*(?:\/\s*(\d{1,3}))?/)
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
    const { number, total, prefix, promoCode } = parseNumberInput(nr)
    if (!name.trim() && total === undefined && !promoCode) return setErr('Name oder Nummer mit Gesamtzahl (z. B. 025/159, TG05/TG30, SWSH062) eingeben.')
    setBusy(true); setErr('')
    try {
      setCards(await findCards({ names: name.trim() ? [name.trim()] : [], number, total, prefix, promoCode, lang }, 20))
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
        <input value={nr} inputMode="text" autoComplete="off" onChange={(e) => setNr(e.target.value)} placeholder="z. B. 025/159, TG05/TG30, SWSH062" />
        <button className="primary" disabled={busy} style={{ marginTop: 10, width: '100%' }}>{busy ? 'Suche …' : 'Suchen'}</button>
      </form>
      {err && <p className="err">{err}</p>}
      {cards && cards.length === 0 && <p className="muted">Keine Treffer.</p>}
      {cards && <div style={{ marginTop: 12 }}><Results cards={cards} onPick={onPick} /></div>}
    </main>
  )
}
