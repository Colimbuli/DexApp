import type { CardInfo } from './types'
import { basePrice, fmtEur } from './pricing'
import { LangBadge } from './LangSelect'
import { RarityBadge } from './Rarity'
import { formatNumber } from './rarity'
import { openImage } from './ImageViewer'

export function Results({ cards, onPick }: { cards: CardInfo[]; onPick: (c: CardInfo) => void }) {
  return (
    <>
      {cards.map((c) => (
        <div className="card item" key={c.lang + c.id}>
          {c.image && <img src={c.image} alt="" loading="lazy" onClick={() => openImage(c.image)} />}
          <div className="grow">
            <strong>{c.name}</strong><LangBadge lang={c.lang} />
            <div className="muted">{c.setName} · {formatNumber(c.localId, c.setTotal)}<RarityBadge rarity={c.rarity} /></div>
            <div className="price">{fmtEur(basePrice(c.pricing, false))}</div>
          </div>
          <button className="primary" onClick={() => onPick(c)}>Wählen</button>
        </div>
      ))}
    </>
  )
}
