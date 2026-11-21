import type { CardInfo } from './types'

const BASE = 'https://api.tcgdex.net/v2/de'

interface RawBrief {
  id: string
  localId: string
  name: string
  image?: string
}

interface RawCard extends RawBrief {
  rarity?: string
  set?: { name?: string; cardCount?: { official?: number; total?: number } }
  pricing?: {
    cardmarket?: Record<string, number | string | null | undefined>
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (res.status === 404) return [] as unknown as T
  if (!res.ok) throw new Error(`TCGdex-Fehler ${res.status}`)
  return (await res.json()) as T
}

export const imageUrl = (image?: string) => (image ? `${image}/low.webp` : undefined)

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined)

export function mapCard(raw: RawCard): CardInfo {
  const cm = raw.pricing?.cardmarket ?? {}
  return {
    id: raw.id,
    name: raw.name,
    localId: raw.localId,
    image: imageUrl(raw.image),
    rarity: raw.rarity,
    setName: raw.set?.name,
    setTotal: raw.set?.cardCount?.official,
    pricing: {
      eur: num(cm['trend']) ?? num(cm['avg']),
      eurHolo: num(cm['trend-holo']) ?? num(cm['avg-holo']),
      updated: typeof cm['updated'] === 'string' ? (cm['updated'] as string) : undefined,
    },
  }
}

export async function searchBriefs(name: string): Promise<RawBrief[]> {
  const q = name.trim()
  if (!q) return []
  return getJson<RawBrief[]>(`/cards?name=${encodeURIComponent(q)}`)
}

export async function getCard(id: string): Promise<CardInfo | undefined> {
  const raw = await getJson<RawCard | never[]>(`/cards/${encodeURIComponent(id)}`)
  if (Array.isArray(raw)) return undefined
  return mapCard(raw)
}

const numericId = (localId: string) => {
  const m = localId.match(/\d+/)
  return m ? parseInt(m[0], 10) : NaN
}

export interface SearchQuery {
  names: string[]
  number?: number
  total?: number
  promoCode?: string
}

/**
 * Sucht Karten über mehrere Namenskandidaten, filtert/rankt nach Sammlernummer
 * und lädt für die besten Treffer die Details (Set, Preise).
 */
export async function findCards(q: SearchQuery, limit = 8): Promise<CardInfo[]> {
  const seen = new Map<string, RawBrief>()
  for (const name of q.names.slice(0, 4)) {
    const briefs = await searchBriefs(name)
    for (const b of briefs) if (!seen.has(b.id)) seen.set(b.id, b)
    if (q.number === undefined && seen.size > 0) break
    if (q.number !== undefined && [...seen.values()].some((b) => numericId(b.localId) === q.number)) break
  }
  let list = [...seen.values()]
  if (q.number !== undefined) {
    const byNumber = list.filter((b) => numericId(b.localId) === q.number)
    if (byNumber.length) list = byNumber
  }
  const details = (await Promise.all(list.slice(0, 30).map((b) => getCard(b.id).catch(() => undefined)))).filter(
    (c): c is CardInfo => !!c,
  )
  return rankCards(details, q).slice(0, limit)
}

export function rankCards(cards: CardInfo[], q: SearchQuery): CardInfo[] {
  const score = (c: CardInfo) => {
    let s = 0
    if (q.number !== undefined && numericId(c.localId) === q.number) s += 3
    if (q.total !== undefined && c.setTotal === q.total) s += 2
    if (q.names.some((n) => c.name.toLowerCase() === n.toLowerCase())) s += 1
    return s
  }
  return [...cards].sort((a, b) => score(b) - score(a))
}
