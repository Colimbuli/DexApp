import type { CardInfo, Lang, LangChoice } from './types'

const BASE = 'https://api.tcgdex.net/v2/'

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

async function getJson<T>(lang: Lang, path: string): Promise<T> {
  const res = await fetch(BASE + lang + path)
  if (res.status === 404) return [] as unknown as T
  if (!res.ok) throw new Error(`TCGdex-Fehler ${res.status}`)
  return (await res.json()) as T
}

export const imageUrl = (image?: string) => (image ? `${image}/low.webp` : undefined)

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined)

export function mapCard(raw: RawCard, lang: Lang): CardInfo {
  const cm = raw.pricing?.cardmarket ?? {}
  return {
    id: raw.id,
    lang,
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

export async function searchBriefs(name: string, lang: Lang): Promise<RawBrief[]> {
  const q = name.trim()
  if (!q) return []
  return getJson<RawBrief[]>(lang, `/cards?name=${encodeURIComponent(q)}`)
}

export async function getCard(id: string, lang: Lang): Promise<CardInfo | undefined> {
  const raw = await getJson<RawCard | never[]>(lang, `/cards/${encodeURIComponent(id)}`)
  if (Array.isArray(raw)) return undefined
  return mapCard(raw, lang)
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
  lang?: LangChoice
  /** weitere Nummern-Lesungen (OCR), werden ebenfalls nachgeschlagen */
  candidates?: { number: number; total: number; prefix?: string }[]
  /** Gallery-Präfix der Hauptlesung (TG, GG, …) */
  prefix?: string
}

/**
 * Sucht Karten über mehrere Namenskandidaten, filtert/rankt nach Sammlernummer
 * und lädt für die besten Treffer die Details (Set, Preise).
 */
export async function findCards(q: SearchQuery, limit = 8): Promise<CardInfo[]> {
  const langs: Lang[] = !q.lang || q.lang === 'both' ? ['de', 'en'] : [q.lang]
  const results = await Promise.allSettled(langs.map((l) => findCardsIn(l, q)))
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (!ok.length && results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason
  return rankCards(ok, q).slice(0, limit)
}

async function findCardsIn(lang: Lang, q: SearchQuery): Promise<CardInfo[]> {
  let setHits: CardInfo[] = []
  // 1. Weg: Sammlernummer + Setgröße – unabhängig vom (oft falsch gelesenen) Namen
  const cands = [
    ...(q.number !== undefined && q.total !== undefined ? [{ number: q.number, total: q.total, prefix: q.prefix }] : []),
    ...(q.candidates ?? []),
  ].filter((c, i, a) => a.findIndex((x) => x.number === c.number && x.total === c.total && x.prefix === c.prefix) === i).slice(0, 3)
  const seenIds = new Set<string>()
  const addHits = (hits: CardInfo[]) => hits.forEach((h) => { if (!seenIds.has(h.id)) { seenIds.add(h.id); setHits.push(h) } })
  if (q.promoCode) addHits(await findByPromo(lang, q.promoCode))
  if (cands.length || setHits.length) {
    for (const c of cands) addHits(await findBySetNumber(lang, c.number, c.total, c.prefix))
    const best = Math.max(0, ...setHits.flatMap((c) => q.names.map((n) => similarity(n, c.name))))
    // Treffer passt zum gelesenen Namen (oder es gibt keinen Namen) → fertig
    if (setHits.length && (best >= 0.5 || !q.names.length)) return setHits
  }
  // 2. Weg: Namenssuche (ergänzt Set-Treffer, falls die Nummer falsch gelesen wurde)
  const seen = new Map<string, RawBrief>()
  for (const name of q.names.slice(0, 4)) {
    let briefs = await searchBriefs(name, lang)
    // OCR fügt oft am Rand ein Zeichen hinzu („Tincineroar“) → gekürzt erneut suchen
    if (!briefs.length && name.length >= 6) briefs = await searchBriefs(name.slice(1, -1), lang)
    for (const b of briefs) if (!seen.has(b.id)) seen.set(b.id, b)
    if (q.number === undefined && seen.size > 0) break
    if (q.number !== undefined && [...seen.values()].some((b) => numericId(b.localId) === q.number)) break
  }
  let list = [...seen.values()]
  if (q.number !== undefined) {
    const byNumber = list.filter((b) => numericId(b.localId) === q.number)
    if (byNumber.length) list = byNumber
  }
  const details = (await Promise.all(list.slice(0, 30).map((b) => getCard(b.id, lang).catch(() => undefined)))).filter(
    (c): c is CardInfo => !!c,
  )
  const ids = new Set(details.map((c) => c.id))
  return rankCards([...details, ...setHits.filter((c) => !ids.has(c.id))], q).slice(0, 20)
}

export function rankCards(cards: CardInfo[], q: SearchQuery): CardInfo[] {
  const score = (c: CardInfo) => {
    let s = 0
    if (q.number !== undefined && numericId(c.localId) === q.number) s += 2
    if (q.total !== undefined && c.setTotal === q.total) s += 1
    // Name wiegt am stärksten: eine falsch gelesene Ziffer darf nicht gewinnen
    s += 4 * Math.max(0, ...q.names.map((n) => similarity(n, c.name)))
    return s
  }
  return [...cards].sort((a, b) => score(b) - score(a))
}

// ---------- Suche über Set und Nummer ----------

interface RawSet {
  id: string
  name: string
  cardCount?: { total?: number; official?: number }
}

const SET_TTL = 24 * 60 * 60 * 1000
const setMem = new Map<Lang, RawSet[]>()
/** nur für Tests */
export const clearSetCache = () => setMem.clear()

export async function getSets(lang: Lang): Promise<RawSet[]> {
  const mem = setMem.get(lang)
  if (mem) return mem
  const key = `tcgdex-sets-${lang}`
  try {
    const c = JSON.parse(localStorage.getItem(key) ?? 'null') as { t: number; sets: RawSet[] } | null
    if (c && Date.now() - c.t < SET_TTL && Array.isArray(c.sets)) {
      setMem.set(lang, c.sets)
      return c.sets
    }
  } catch { /* Cache nicht verfügbar */ }
  const sets = await getJson<RawSet[]>(lang, '/sets')
  setMem.set(lang, sets)
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), sets })) } catch { /* egal */ }
  return sets
}

/** Mögliche localId-Schreibweisen einer Nummer: „044“, „44“. */
export function localIdVariants(n: number, prefix?: string): string[] {
  if (prefix) return [...new Set([2, 1, 3].map((p) => prefix + String(n).padStart(p, '0')))]
  return [...new Set([String(n).padStart(3, '0'), String(n)])]
}

export async function findBySetNumber(lang: Lang, number: number, total: number, prefix?: string): Promise<CardInfo[]> {
  const sets = (await getSets(lang)).filter((x) => x.cardCount?.official === total).slice(0, 8)
  const found = await Promise.all(
    sets.map(async (set) => {
      for (const lid of localIdVariants(number, prefix)) {
        const c = await getCard(`${set.id}-${lid}`, lang).catch(() => undefined)
        if (c) return c
      }
      return undefined
    }),
  )
  return found.filter((c): c is CardInfo => !!c)
}

/**
 * Promokarten („SWSH062“, „SVP 045“, „SM100“): Promo-Sets, deren ID mit dem Präfix
 * beginnt (swshp, svp, smp, …), mit verschiedenen localId-Schreibweisen abfragen.
 */
export async function findByPromo(lang: Lang, code: string): Promise<CardInfo[]> {
  const m = code.toUpperCase().replace(/[\s-]/g, '').match(/^([A-Z]+)(\d+)$/)
  if (!m) return []
  const [, prefix, digits] = m
  const n = parseInt(digits, 10)
  const sets = (await getSets(lang)).filter((x) => /promo/i.test(x.name) && x.id.toLowerCase().startsWith(prefix.toLowerCase().replace(/p$/, '')))
  const ids = [...new Set([prefix + digits, prefix + String(n).padStart(3, '0'), String(n).padStart(3, '0'), String(n)])]
  const found = await Promise.all(
    sets.slice(0, 4).map(async (set) => {
      for (const lid of ids) {
        const c = await getCard(`${set.id}-${lid}`, lang).catch(() => undefined)
        if (c) return c
      }
      return undefined
    }),
  )
  return found.filter((c): c is CardInfo => !!c)
}

// ---------- unscharfer Namensvergleich ----------

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/** 0…1; vergleicht den OCR-Token mit dem Kartennamen und dessen einzelnen Wörtern. */
export function similarity(ocr: string, name: string): number {
  const a = norm(ocr)
  if (!a) return 0
  const parts = [name, ...name.split(/[\s-]+/)].map(norm).filter(Boolean)
  return Math.max(0, ...parts.map((b) => 1 - levenshtein(a, b) / Math.max(a.length, b.length)))
}
