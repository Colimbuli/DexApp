import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { parseOcr } from './ocr'
import { unitValue, totalValue } from './pricing'
import { mapCard, rankCards } from './tcgdex'
import { toCsv } from './csv'
import { addToCollection, createProfile, db, refreshPrices, verifyPin } from './db'

const raw = {
  id: 'sv01-025', localId: '025', name: 'Pikachu', image: 'https://assets.tcgdex.net/de/sv/sv01/025',
  set: { name: 'Karmesin & Purpur', cardCount: { official: 198 } },
  pricing: { cardmarket: { trend: 1.5, 'trend-holo': 4, updated: '2026-11-20T00:00:00Z' } },
}

describe('ocr', () => {
  it('liest Nummer und Namen', () => {
    const p = parseOcr('Basis\nPikachu KP 70\n', 'Illus. X  025/198 ★')
    expect(p.number).toBe(25)
    expect(p.total).toBe(198)
    expect(p.names).toContain('Pikachu')
    expect(p.names).not.toContain('Basis')
  })
  it('erkennt Promo-Codes', () => {
    expect(parseOcr('Mew', 'SWSH062').promoCode).toBe('SWSH062')
  })
})

describe('pricing & mapping', () => {
  const card = mapCard(raw, 'de')
  it('mappt Preise', () => {
    expect(card.pricing.eur).toBe(1.5)
    expect(card.pricing.eurHolo).toBe(4)
    expect(card.setTotal).toBe(198)
    expect(card.image).toMatch(/low\.webp$/)
  })
  it('wendet Zustandsfaktor an', () => {
    expect(unitValue({ basePrice: 10, holo: false, condition: 'LP' })).toBe(5.5)
    expect(unitValue({ basePrice: 10, baseHoloPrice: 20, holo: true, condition: 'NM' })).toBe(20)
    expect(unitValue({ holo: false, condition: 'NM' })).toBeUndefined()
  })
  it('rankt nach Nummer und Gesamtzahl', () => {
    const other = { ...card, id: 'x', localId: '026', setTotal: 100 }
    expect(rankCards([other, card], { names: ['Pikachu'], number: 25, total: 198 })[0].id).toBe('sv01-025')
  })
  it('CSV mit Dezimalkomma', () => {
    const csv = toCsv([{ profileId: 1, cardId: 'a', lang: 'en', name: 'A;B', setName: 'S', localId: '1', qty: 2, condition: 'NM', holo: false, basePrice: 1.5, addedAt: '' }])
    expect(csv).toContain('"A;B";EN;')
    expect(csv).toContain('1,50;3,00')
  })
})

describe('db', () => {
  it('Profile, Zusammenführen, Summe, Preis-Update', async () => {
    const id = await createProfile('Test', '1234')
    const p = (await db.profiles.get(id))!
    expect(await verifyPin(p, '1234')).toBe(true)
    expect(await verifyPin(p, '0000')).toBe(false)
    const card = mapCard(raw, 'de')
    await addToCollection(id, card, { qty: 1, condition: 'NM', holo: false })
    await addToCollection(id, card, { qty: 2, condition: 'NM', holo: false })
    await addToCollection(id, card, { qty: 1, condition: 'LP', holo: false })
    await addToCollection(id, { ...card, lang: 'en' }, { qty: 1, condition: 'NM', holo: false })
    const rows = await db.entries.where('profileId').equals(id).toArray()
    expect(rows).toHaveLength(3)
    expect(totalValue(rows)).toBeCloseTo(4 * 1.5 + 0.55 * 1.5)
    const calls: string[] = []
    const r = await refreshPrices(id, async (cid, l) => { calls.push(l); return mapCard({ ...raw, pricing: { cardmarket: { trend: 3 } } }, l) })
    expect(r.updated).toBe(2)
    expect(calls.sort()).toEqual(['de', 'en'])
    expect((await db.entries.where('profileId').equals(id).first())!.basePrice).toBe(3)
    const bad = await refreshPrices(id, async () => undefined)
    expect(bad.failed).toBe(2)
  })
})

import { cardRect, CARD_ASPECT } from './geometry'
describe('geometry', () => {
  it('Kartenrahmen passt in Hoch- und Querformat', () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [3000, 4000], [500, 500]]) {
      const r = cardRect(w, h)
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(w)
      expect(r.y + r.h).toBeLessThanOrEqual(h)
      expect(r.w / r.h).toBeCloseTo(CARD_ASPECT)
    }
  })
})

describe('englisch', () => {
  it('OCR ignoriert englische Füllwörter', () => {
    const p = parseOcr('Basic\nCharizard HP 170\n', '004/165')
    expect(p.names[0]).toBe('Charizard')
    expect(p.names).not.toContain('Basic')
  })
})
