import type { CardInfo } from './types'
import { basePrice, fmtEur } from './pricing'
import { LangBadge } from './LangSelect'

export function Results({ cards, onPick }: { cards: CardInfo[]; onPick: (c: CardInfo) => void }) {
  return (
    <>
      {cards.map((c) => (
        <div className="card item" key={c.lang + c.id}>
          {c.image && <img src={c.image} alt="" loading="lazy" />}
          <div className="grow">
            <strong>{c.name}</strong><LangBadge lang={c.lang} />
            <div className="muted">{c.setName} · {c.localId}{c.setTotal ? `/${c.setTotal}` : ''}</div>
            <div className="price">{fmtEur(basePrice(c.pricing, false))}</div>
          </div>
          <button className="primary" onClick={() => onPick(c)}>Wählen</button>
        </div>
      ))}
    </>
  )
}
