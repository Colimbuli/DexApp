import { db } from './db'
import { getCard, getSetDetail, getSets, type SetDetail } from './tcgdex'
import type { CardInfo, Lang } from './types'

const DAY = 24 * 60 * 60 * 1000

/** Kartendetails inkl. Preis, einen Tag zwischengespeichert (spart Anfragen in der Set-Checkliste). */
export async function getCardCached(id: string, lang: Lang, maxAge = DAY): Promise<CardInfo | undefined> {
  const key = `${lang}|${id}`
  const hit = await db.cardCache.get(key).catch(() => undefined)
  if (hit && Date.now() - hit.t < maxAge) return hit.data ?? undefined
  const card = await getCard(id, lang)
  await db.cardCache.put({ key, t: Date.now(), data: card ?? null }).catch(() => {})
  return card
}

/** Set mit Kartenliste, einen Tag zwischengespeichert. */
export async function getSetCached(id: string, lang: Lang): Promise<SetDetail | undefined> {
  const key = `${lang}|${id}`
  const hit = await db.setCache.get(key).catch(() => undefined)
  if (hit && Date.now() - hit.t < DAY) return (hit.data as SetDetail | null) ?? undefined
  const set = await getSetDetail(lang, id)
  await db.setCache.put({ key, t: Date.now(), data: set ?? null }).catch(() => {})
  return set
}

/** Erscheinungsdatum eines Sets (JJJJ-MM-TT) */
export async function getSetRelease(id: string, lang: Lang): Promise<string | undefined> {
  const d = (await getSetCached(id, lang))?.releaseDate
  return d && /^\d{4}/.test(d) ? d.slice(0, 10) : undefined
}

export { getSets }
