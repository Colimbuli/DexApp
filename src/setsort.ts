import type { CollectionEntry } from './types'
import { unitValue } from './pricing'

const setKey = (e: CollectionEntry) => e.setId ?? e.cardId.replace(/-[^-]+$/, '')

/** „TG05“ → ['TG', 5], „089“ → ['', 89] */
const numKey = (localId: string): [string, number] => {
  const m = localId.toUpperCase().match(/^([A-Z]*)(\d+)/)
  return m ? [m[1], parseInt(m[2], 10)] : [localId, 0]
}

/** Neuestes Set zuerst (ohne Datum ans Ende), dann Setname, dann Kartennummer */
export function compareBySet(a: CollectionEntry, b: CollectionEntry): number {
  const da = a.releaseDate ?? '', dbb = b.releaseDate ?? ''
  if (da !== dbb) return !da ? 1 : !dbb ? -1 : dbb.localeCompare(da)
  const s = (a.setName || '').localeCompare(b.setName || '', 'de') || setKey(a).localeCompare(setKey(b))
  if (s) return s
  const [pa, na] = numKey(a.localId), [pb, nb] = numKey(b.localId)
  return pa.localeCompare(pb) || na - nb
}

export function groupBySet(sorted: CollectionEntry[]) {
  const groups: { key: string; name: string; year?: number; count: number; value: number; entries: CollectionEntry[] }[] = []
  for (const e of sorted) {
    const key = setKey(e)
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      g = { key, name: e.setName, year: e.year || undefined, count: 0, value: 0, entries: [] }
      groups.push(g)
    }
    g.entries.push(e)
    g.count += e.qty
    g.value += (unitValue(e) ?? 0) * e.qty
  }
  return groups
}

