import { useState } from 'react'
import { rarityInfo } from './rarity'

/** Seltenheitssymbol; Antippen zeigt den Namen der Seltenheit. */
export function RarityBadge({ rarity }: { rarity?: string }) {
  const [open, setOpen] = useState(false)
  const info = rarityInfo(rarity)
  if (!info) return null
  return (
    <button type="button" className={`rarity r-${info.color}`} title={info.label} aria-label={`Seltenheit: ${info.label}`}
      onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
      {info.symbol}{open && <span className="rarity-label">{info.label}</span>}
    </button>
  )
}
