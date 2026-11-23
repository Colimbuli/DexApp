import Dexie, { type Table } from 'dexie'
import type { CardDetails, CardInfo, CollectionEntry, Condition, Lang, Profile } from './types'
import { basePrice } from './pricing'

export interface CacheRow<T> {
  key: string
  t: number
  data: T
}

class AppDb extends Dexie {
  profiles!: Table<Profile, number>
  entries!: Table<CollectionEntry, number>
  cardCache!: Table<CacheRow<CardInfo | null>, string>
  setCache!: Table<CacheRow<unknown>, string>
  constructor() {
    super('kartenscanner')
    this.version(1).stores({
      profiles: '++id, name',
      entries: '++id, profileId, cardId',
    })
    this.version(2)
      .stores({ entries: '++id, profileId, cardId, lang' })
      .upgrade((tx) =>
        tx.table('entries').toCollection().modify((e: CollectionEntry) => {
          e.lang ??= 'de'
        }),
      )
    this.version(3).stores({ cardCache: '&key', setCache: '&key' })
  }
}

export const db = new AppDb()

// Öffnet ein anderer Tab eine neuere Datenbankversion, schließt Dexie diese Verbindung.
// Statt danach still zu scheitern, lädt dieser (veraltete) Tab neu.
db.on('versionchange', () => {
  db.close()
  if (typeof location !== 'undefined') location.reload()
  return false
})

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + ':' + pin)
  return hex(await crypto.subtle.digest('SHA-256', data))
}

export async function createProfile(name: string, pin?: string): Promise<number> {
  const profile: Profile = { name: name.trim() }
  if (pin) {
    profile.salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer)
    profile.pinHash = await hashPin(pin, profile.salt)
  }
  return db.profiles.add(profile)
}

export async function verifyPin(p: Profile, pin: string): Promise<boolean> {
  if (!p.pinHash || !p.salt) return true
  return (await hashPin(pin, p.salt)) === p.pinHash
}

export async function deleteProfile(id: number) {
  await db.transaction('rw', db.profiles, db.entries, async () => {
    await db.entries.where('profileId').equals(id).delete()
    await db.profiles.delete(id)
  })
}

export interface AddOptions {
  qty: number
  condition: Condition
  holo: boolean
}

/** Gleiche Karte mit gleichem Zustand/Variante wird zusammengeführt. */
export async function addToCollection(profileId: number, card: CardInfo, o: AddOptions) {
  const existing = await db.entries
    .where('profileId')
    .equals(profileId)
    .filter((e) => e.cardId === card.id && e.lang === card.lang && e.condition === o.condition && e.holo === o.holo)
    .first()
  const price = {
    basePrice: card.pricing.eur,
    baseHoloPrice: card.pricing.eurHolo,
    priceUpdated: card.pricing.updated ?? new Date().toISOString(),
  }
  if (existing?.id !== undefined) {
    await db.entries.update(existing.id, { qty: existing.qty + o.qty, ...price })
    return
  }
  await db.entries.add({
    profileId,
    cardId: card.id,
    lang: card.lang,
    name: card.name,
    setName: card.setName ?? '',
    localId: card.localId,
    setTotal: card.setTotal,
    rarity: card.rarity ?? '',
    ...cardDetails(card),
    image: card.image,
    qty: o.qty,
    condition: o.condition,
    holo: o.holo,
    ...price,
    addedAt: new Date().toISOString(),
  })
}

export async function refreshPrices(
  profileId: number,
  fetchCard: (id: string, lang: Lang) => Promise<CardInfo | undefined>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ updated: number; failed: number }> {
  const entries = await db.entries.where('profileId').equals(profileId).toArray()
  const keys = [...new Set(entries.map((e) => `${e.lang ?? 'de'}|${e.cardId}`))]
  let updated = 0
  let failed = 0
  let done = 0
  for (const key of keys) {
    const [lang, id] = key.split(/\|(.*)/s) as [Lang, string]
    try {
      const card = await fetchCard(id, lang)
      if (!card || basePrice(card.pricing, false) === undefined) throw new Error('kein Preis')
      await db.entries
        .where('profileId')
        .equals(profileId)
        .filter((e) => e.cardId === id && (e.lang ?? 'de') === lang)
        .modify({
          basePrice: card.pricing.eur,
          baseHoloPrice: card.pricing.eurHolo,
          priceUpdated: card.pricing.updated ?? new Date().toISOString(),
          rarity: card.rarity ?? '',
          setTotal: card.setTotal,
          ...cardDetails(card),
        })
      updated++
    } catch {
      failed++
    }
    onProgress?.(++done, keys.length)
  }
  return { updated, failed }
}

export interface Backup {
  version: 1
  profileName: string
  entries: Omit<CollectionEntry, 'id' | 'profileId'>[]
}

export async function exportBackup(profileId: number): Promise<Backup> {
  const p = await db.profiles.get(profileId)
  const entries = await db.entries.where('profileId').equals(profileId).toArray()
  return {
    version: 1,
    profileName: p?.name ?? '',
    entries: entries.map(({ id: _i, profileId: _p, ...rest }) => rest),
  }
}

export async function importBackup(profileId: number, data: unknown): Promise<number> {
  const b = data as Backup
  if (!b || b.version !== 1 || !Array.isArray(b.entries)) throw new Error('Ungültige Sicherungsdatei')
  const rows = b.entries.map((e) => ({ ...e, profileId, qty: Math.max(1, Math.floor(Number(e.qty) || 1)), lang: e.lang === 'en' ? 'en' : 'de' }))
  await db.entries.bulkAdd(rows as CollectionEntry[])
  return rows.length
}

export const INFO_VERSION = 3

/** Felder für Filter, aus Kartendaten und (optional) Erscheinungsjahr des Sets */
export function cardDetails(card: CardInfo, releaseDate?: string | null): CardDetails & { infoV?: number } {
  const d: CardDetails & { infoV?: number } = {
    setId: card.setId,
    category: card.category,
    stage: card.stage,
    types: card.types,
    hp: card.hp,
    illustrator: card.illustrator,
    regulationMark: card.regulationMark,
  }
  // null = Set ohne Datum: trotzdem als ergänzt markieren, damit nicht ständig nachgeladen wird
  if (releaseDate !== undefined) {
    if (releaseDate) { d.releaseDate = releaseDate; d.year = parseInt(releaseDate.slice(0, 4), 10) }
    d.infoV = INFO_VERSION
  }
  return d
}

/**
 * Ergänzt bei älteren Einträgen Seltenheit, Setgröße, Typ, Phase, Illustrator,
 * Regulierungszeichen und Erscheinungsjahr (einmalig, braucht Internet).
 */
export async function backfillCardInfo(
  profileId: number,
  fetchCard: (id: string, lang: Lang) => Promise<CardInfo | undefined>,
  fetchRelease: (setId: string, lang: Lang) => Promise<string | undefined>,
): Promise<number> {
  const missing = await db.entries.where('profileId').equals(profileId).filter((e) => (e.infoV ?? 0) < INFO_VERSION).toArray()
  const keys = [...new Set(missing.map((e) => `${e.lang ?? 'de'}|${e.cardId}`))]
  let done = 0
  for (const key of keys) {
    const [lang, id] = key.split(/\|(.*)/s) as [Lang, string]
    const card = await fetchCard(id, lang).catch(() => undefined)
    if (!card) continue
    const release = card.setId ? await fetchRelease(card.setId, lang).catch(() => undefined) : undefined
    await db.entries
      .where('profileId')
      .equals(profileId)
      .filter((e) => e.cardId === id && (e.lang ?? 'de') === lang)
      .modify({ rarity: card.rarity ?? '', setTotal: card.setTotal, ...cardDetails(card, release ?? null) })
    done++
  }
  return done
}
