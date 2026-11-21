import { useState } from 'react'
import type { LangChoice } from './types'

const KEY = 'langChoice'

export function useLangChoice(): [LangChoice, (l: LangChoice) => void] {
  const [v, setV] = useState<LangChoice>(() => {
    try {
      const s = localStorage.getItem(KEY)
      return s === 'de' || s === 'en' || s === 'both' ? s : 'both'
    } catch {
      return 'both'
    }
  })
  return [v, (l) => { setV(l); try { localStorage.setItem(KEY, l) } catch { /* egal */ } }]
}

export function LangSelect({ value, onChange }: { value: LangChoice; onChange: (l: LangChoice) => void }) {
  const opts: [LangChoice, string][] = [['both', 'Beide'], ['de', 'Deutsch'], ['en', 'Englisch']]
  return (
    <div className="seg" role="radiogroup" aria-label="Katalogsprache">
      {opts.map(([k, label]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export const LangBadge = ({ lang }: { lang?: string }) => <span className="badge">{(lang ?? 'de').toUpperCase()}</span>
