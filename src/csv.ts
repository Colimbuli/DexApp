import type { CollectionEntry } from './types'
import { unitValue } from './pricing'

const esc = (v: string | number) => {
  const s = String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const dec = (n: number | undefined) => (n === undefined ? '' : n.toFixed(2).replace('.', ','))

/** Semikolon-getrennt mit Dezimalkomma – öffnet direkt in deutschem Excel. */
export function toCsv(entries: CollectionEntry[]): string {
  const head = ['Name', 'Set', 'Nummer', 'Anzahl', 'Zustand', 'Holo', 'Einzelwert EUR', 'Gesamtwert EUR', 'Preisstand']
  const rows = entries.map((e) => {
    const u = unitValue(e)
    return [
      e.name, e.setName, e.localId, e.qty, e.condition, e.holo ? 'ja' : 'nein',
      dec(u), dec(u === undefined ? undefined : u * e.qty), e.priceUpdated?.slice(0, 10) ?? '',
    ].map(esc).join(';')
  })
  return '﻿' + [head.join(';'), ...rows].join('\r\n')
}
