import { rarityInfo } from './rarity'

/** Gemeinsame Sicht auf Sammlungseinträge und Katalogkarten für die Filter */
export interface Filterable {
  setName?: string
  types?: string[]
  stage?: string
  category?: string
  rarity?: string
  regulationMark?: string
  illustrator?: string
  year?: number
  lang?: string
}

export interface Facet<T> {
  key: string
  label: string
  values: (item: T) => string[]
  /** Anzeige eines Werts in der Auswahl */
  display?: (v: string) => string
  /** Sortierung der Werte */
  sort?: (a: string, b: string) => number
}

const one = (v?: string | number) => (v === undefined || v === '' || v === 0 ? [] : [String(v)])

export const FACETS: Facet<Filterable>[] = [
  { key: 'set', label: 'Set', values: (i) => one(i.setName) },
  { key: 'year', label: 'Jahr', values: (i) => one(i.year), sort: (a, b) => b.localeCompare(a) },
  { key: 'type', label: 'Typ', values: (i) => i.types ?? [] },
  { key: 'stage', label: 'Phase', values: (i) => one(i.stage ?? i.category) },
  {
    key: 'rarity',
    label: 'Seltenheit',
    values: (i) => one(i.rarity),
    display: (v) => `${rarityInfo(v)?.symbol ?? ''} ${v}`.trim(),
  },
  { key: 'reg', label: 'Regulierung', values: (i) => one(i.regulationMark) },
  { key: 'illus', label: 'Illustrator', values: (i) => one(i.illustrator) },
  { key: 'lang', label: 'Sprache', values: (i) => one(i.lang?.toUpperCase()) },
]

export type FilterState = Record<string, string>

export function facetOptions<T>(items: T[], facet: Facet<T>): string[] {
  const s = new Set<string>()
  for (const i of items) for (const v of facet.values(i)) s.add(v)
  return [...s].sort(facet.sort ?? ((a, b) => a.localeCompare(b, 'de')))
}

export function applyFilters<T>(items: T[], facets: Facet<T>[], state: FilterState): T[] {
  const active = facets.filter((f) => state[f.key])
  if (!active.length) return items
  return items.filter((i) => active.every((f) => f.values(i).includes(state[f.key])))
}
