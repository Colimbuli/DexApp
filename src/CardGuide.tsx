import { useState } from 'react'

/** Beispielkarte: Gallopa, 151 (MEW), 078/165 – Bild aus dem TCGdex-Katalog */
const EXAMPLE = 'https://assets.tcgdex.net/de/sv/sv03.5/078/high.webp'

interface Spot {
  x: number
  y: number
  title: string
  text: string
  filter?: boolean
}

/** Positionen in % der Kartenbreite/-höhe */
const SPOTS: Spot[] = [
  { x: 11, y: 4, title: 'Phase', text: 'Entwicklungsstufe: Basis, Phase 1 oder Phase 2. Phase-Karten dürfen nur auf ihre Vorstufe gelegt werden.', filter: true },
  { x: 30, y: 6, title: 'Name', text: 'Name des Pokémon. Zusätze wie „ex“, „V“ oder „VSTAR“ gehören zum Namen und kennzeichnen Regelkarten.' },
  { x: 79, y: 6, title: 'KP', text: 'Kraftpunkte: so viel Schaden hält das Pokémon aus, bevor es kampfunfähig ist.' },
  { x: 92, y: 6, title: 'Typ', text: 'Energietyp des Pokémon (hier Feuer). Bestimmt Schwächen und Resistenzen anderer Pokémon.', filter: true },
  { x: 9, y: 12.5, title: 'Vorstufe', text: '„Entwickelt sich aus …“ mit Bild der Vorstufe (hier Ponita).' },
  { x: 50, y: 29, title: 'Illustration', text: 'Artwork der Karte. Bei Illustration Rares reicht es über die ganze Karte.' },
  { x: 50, y: 49, title: 'Pokédex-Zeile', text: 'Pokédex-Nummer, Kategorie, Größe und Gewicht – reine Information.' },
  { x: 9.5, y: 59.8, title: 'Energiekosten', text: 'Benötigte Energie für die Attacke. Der weiße Stern steht für beliebige (farblose) Energie.' },
  { x: 44, y: 59.8, title: 'Attacke', text: 'Name und Effekt der Attacke. Darunter der Effekttext.' },
  { x: 89, y: 69, title: 'Schaden', text: 'Grundschaden der Attacke.' },
  { x: 10, y: 87.6, title: 'Schwäche', text: 'Erleidet doppelten Schaden von Pokémon dieses Typs (hier Wasser ×2).' },
  { x: 36, y: 87.6, title: 'Resistenz', text: 'Erleidet weniger Schaden von Pokémon dieses Typs (hier keine).' },
  { x: 67, y: 87.6, title: 'Rückzug', text: 'So viele Energien müssen abgelegt werden, um das Pokémon auf die Bank zurückzuziehen.' },
  { x: 23, y: 91.3, title: 'Illustrator', text: 'Künstler bzw. Künstlerin des Artworks.', filter: true },
  { x: 70, y: 93.7, title: 'Flavor-Text', text: 'Pokédex-Text ohne Spielwirkung.' },
  { x: 7, y: 97.5, title: 'Regulierungszeichen', text: 'Buchstabe (hier G) bestimmt, bis wann die Karte im Standard-Format erlaubt ist.', filter: true },
  { x: 12.5, y: 94, title: 'Set-Kürzel', text: 'Kürzel der Erweiterung und Sprache (hier MEW = 151, DE = deutsch).', filter: true },
  { x: 21.5, y: 97.5, title: 'Kartennummer', text: 'Nummer im Set / offizielle Kartenzahl (078/165). Liegt die Nummer über der Zahl (z. B. 201/165), ist es eine Secret Rare.' },
  { x: 29.5, y: 94, title: 'Seltenheit', text: '● häufig · ◆ nicht so häufig · ★ selten · ★★ doppelt selten · ★★ silber Ultra Rare · ★ gold Illustration Rare · ★★ gold Special Illustration Rare · ★★★ gold Hyper Rare.', filter: true },
  { x: 50, y: 98.6, title: 'Copyright-Jahr', text: 'Jahr der Veröffentlichung (hier 2023). Entspricht dem Erscheinungsjahr des Sets.', filter: true },
]

export function CardGuide() {
  const [sel, setSel] = useState<number>()
  const [imgOk, setImgOk] = useState(true)
  return (
    <main>
      <h1>Kartenkunde</h1>
      <p className="muted">Tippe auf eine Nummer. Mit ⚲ markierte Elemente sind in Sammlung und Set-Checkliste filterbar.</p>
      {imgOk && (
        <div className="guide">
          <img src={EXAMPLE} alt="Beispielkarte Gallopa" onError={() => setImgOk(false)} />
          {SPOTS.map((s, i) => (
            <button key={i} className={`spot${sel === i ? ' on' : ''}`} style={{ left: `${s.x}%`, top: `${s.y}%` }}
              onClick={() => setSel(sel === i ? undefined : i)} aria-label={s.title}>{i + 1}</button>
          ))}
        </div>
      )}
      {sel !== undefined && (
        <div className="card guide-sel">
          <strong>{sel + 1}. {SPOTS[sel].title}{SPOTS[sel].filter ? ' ⚲' : ''}</strong>
          <div>{SPOTS[sel].text}</div>
        </div>
      )}
      <ol className="guide-list">
        {SPOTS.map((s, i) => (
          <li key={i} className={sel === i ? 'on' : ''} onClick={() => setSel(i)}>
            <strong>{s.title}{s.filter ? ' ⚲' : ''}</strong> – {s.text}
          </li>
        ))}
      </ol>
    </main>
  )
}
