import type { CardPricing, CollectionEntry, Condition } from './types'

/**
 * Cardmarket-Trendpreise beziehen sich im Wesentlichen auf Near Mint.
 * Die Faktoren sind eine grobe Schätzung, keine Marktdaten.
 */
export const CONDITION_FACTOR: Record<Condition, number> = {
  MT: 1.1,
  NM: 1.0,
  EX: 0.85,
  GD: 0.7,
  LP: 0.55,
  PL: 0.4,
  PO: 0.25,
}

export const CONDITION_LABEL: Record<Condition, string> = {
  MT: 'Mint',
  NM: 'Near Mint',
  EX: 'Excellent',
  GD: 'Good',
  LP: 'Light Played',
  PL: 'Played',
  PO: 'Poor',
}

export function basePrice(p: CardPricing, holo: boolean): number | undefined {
  if (holo) return p.eurHolo ?? p.eur
  return p.eur ?? p.eurHolo
}

export function unitValue(e: Pick<CollectionEntry, 'basePrice' | 'baseHoloPrice' | 'holo' | 'condition'>): number | undefined {
  const base = e.holo ? e.baseHoloPrice ?? e.basePrice : e.basePrice ?? e.baseHoloPrice
  if (base === undefined) return undefined
  return Math.round(base * CONDITION_FACTOR[e.condition] * 100) / 100
}

export function totalValue(entries: CollectionEntry[]): number {
  return entries.reduce((sum, e) => sum + (unitValue(e) ?? 0) * e.qty, 0)
}

export const fmtEur = (n: number | undefined) =>
  n === undefined ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
