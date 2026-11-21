import { useEffect, useRef, useState } from 'react'
import type { CardInfo, Condition } from './types'
import { basePrice, CONDITION_LABEL, fmtEur, unitValue } from './pricing'
import { addToCollection } from './db'

export function AddDialog({ card, profileId, onClose }: { card?: CardInfo; profileId: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [qty, setQty] = useState(1)
  const [condition, setCondition] = useState<Condition>('NM')
  const [holo, setHolo] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (card && !d.open) { setQty(1); setCondition('NM'); setHolo(false); d.showModal() }
    if (!card && d.open) d.close()
  }, [card])

  if (!card) return <dialog ref={ref} onClose={onClose} />
  const preview = unitValue({ basePrice: card.pricing.eur, baseHoloPrice: card.pricing.eurHolo, holo, condition })
  const hasHolo = card.pricing.eurHolo !== undefined

  return (
    <dialog ref={ref} onClose={onClose}>
      <div className="item">
        {card.image && <img src={card.image} alt="" />}
        <div className="grow">
          <strong>{card.name}</strong>
          <div className="muted">{card.setName} · {card.localId}{card.setTotal ? `/${card.setTotal}` : ''}</div>
          <div className="muted">{card.rarity}</div>
        </div>
      </div>
      <label>Zustand</label>
      <select value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
        {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => <option key={c} value={c}>{c} – {CONDITION_LABEL[c]}</option>)}
      </select>
      {hasHolo && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
          <input type="checkbox" checked={holo} onChange={(e) => setHolo(e.target.checked)} style={{ width: 'auto' }} />
          Holo / Reverse Holo
        </label>
      )}
      <label>Anzahl</label>
      <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(+e.target.value) || 1))} />
      <p>
        Geschätzter Wert: <span className="price">{fmtEur(preview)}</span>
        {basePrice(card.pricing, holo) === undefined && <span className="muted"> (kein Marktpreis verfügbar)</span>}
      </p>
      <div className="row">
        <button onClick={onClose}>Abbrechen</button>
        <button className="primary" onClick={async () => { await addToCollection(profileId, card, { qty, condition, holo }); onClose() }}>
          Hinzufügen
        </button>
      </div>
    </dialog>
  )
}
