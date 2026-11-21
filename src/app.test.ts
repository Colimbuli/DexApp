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

import { findCards, similarity, localIdVariants, clearSetCache } from './tcgdex'
import { vi } from 'vitest'
describe('Suche über Nummer', () => {
  it('unscharfer Namensvergleich', () => {
    expect(similarity('EJektek', 'Elektek')).toBeGreaterThan(0.8)
    expect(similarity('EJektek', 'Glurak')).toBeLessThan(0.5)
    expect(similarity('Pikachu', 'Pikachu V')).toBe(1)
    expect(localIdVariants(44)).toEqual(['044', '44'])
  })
  it('findet 044/163 trotz falschem Namen und wählt das passende Set', async () => {
    const card = (id: string, name: string) => ({ id, localId: '044', name, set: { name: id, cardCount: { official: 163 } }, pricing: { cardmarket: { trend: 1 } } })
    const fetchMock = vi.fn(async (url: string) => {
      const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j })
      if (url.endsWith('/de/sets')) return ok([
        { id: 'swsh5', name: 'Kampfstile', cardCount: { official: 163 } },
        { id: 'xx1', name: 'Anderes', cardCount: { official: 163 } },
        { id: 'yy', name: 'Falsch', cardCount: { official: 100 } },
      ])
      if (url.endsWith('/de/cards/swsh5-044')) return ok(card('swsh5-044', 'Elektek'))
      if (url.endsWith('/de/cards/xx1-044')) return ok(card('xx1-044', 'Raichu'))
      return { ok: false, status: 404, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await findCards({ names: ['EJektek'], number: 44, total: 163, lang: 'de' })
    expect(res.map((c) => c.id)).toEqual(['swsh5-044', 'xx1-044'])
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('yy-'))).toBe(false)
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('?name='))).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('Absicherung falsche Nummer', () => {
  it('ergänzt Namenssuche, wenn Set-Treffer nicht zum Namen passt', async () => {
    clearSetCache()
    const mk = (id: string, localId: string, name: string, total: number) => ({ id, localId, name, set: { cardCount: { official: total } }, pricing: {} })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j })
      if (url.endsWith('/de/sets')) return ok([{ id: 'a', name: 'A', cardCount: { official: 163 } }])
      if (url.endsWith('/de/cards/a-044')) return ok(mk('a-044', '044', 'Raichu', 163))
      if (url.includes('?name=Glurak')) return ok([{ id: 'b-004', localId: '004', name: 'Glurak' }])
      if (url.endsWith('/de/cards/b-004')) return ok(mk('b-004', '004', 'Glurak', 102))
      return { ok: false, status: 404, json: async () => ({}) }
    }))
    const res = await findCards({ names: ['Glurak'], number: 44, total: 163, lang: 'de' })
    expect(res.map((c) => c.id)).toContain('b-004')
    expect(res.map((c) => c.id)).toContain('a-044')
    vi.unstubAllGlobals()
  })
})

describe('Erkennung A/B', () => {
  it('ignoriert Vorstufe aus „Evolves from“ / „Entwickelt sich aus“', () => {
    const en = parseOcr('Tincineroar HP 170\nEvolves from Torracat\n', '')
    expect(en.names).toContain('Tincineroar')
    expect(en.names).not.toContain('Torracat')
    const de = parseOcr('Fuegro KP 170\nEntwickelt sich aus Miezunder\n', '')
    expect(de.names).not.toContain('Miezunder')
  })
  it('sucht gekürzten Namen, wenn OCR ein Randzeichen hinzufügt', async () => {
    clearSetCache()
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j })
      if (url.includes('?name=incinero')) return ok([{ id: 'sv5-032', localId: '032', name: 'Incineroar' }])
      if (url.endsWith('/en/cards/sv5-032')) return ok({ id: 'sv5-032', localId: '032', name: 'Incineroar', set: { cardCount: { official: 162 } }, pricing: {} })
      if (url.includes('?name=')) return ok([])
      return { ok: false, status: 404, json: async () => ({}) }
    }))
    const res = await findCards({ names: ['Tincineroar'], lang: 'en' })
    expect(res[0]?.name).toBe('Incineroar')
    vi.unstubAllGlobals()
  })
})

import { numberMatches, vote } from './ocr'
import { parseNumberInput } from './Search'
import { pickMainCamera } from './camera'
describe('Runde 7', () => {
  it('Nummern-Kandidaten und Abstimmung', () => {
    expect(numberMatches('x 025/159 * y 028/159')).toEqual([{ number: 25, total: 159 }, { number: 28, total: 159 }])
    expect(numberMatches('© 2023/0')).toEqual([])
    const v = vote([{ number: 28, total: 159 }, { number: 25, total: 159 }, { number: 25, total: 159 }])
    expect(v[0]).toEqual({ number: 25, total: 159, votes: 2 })
  })
  it('Name schlägt falsch gelesene Ziffer', async () => {
    clearSetCache()
    const mk = (id: string, name: string) => ({ id, localId: id.split('-')[1], name, set: { cardCount: { official: 159 } }, pricing: {} })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j })
      if (url.endsWith('/en/sets')) return ok([{ id: 'swsh12', name: 'Crown', cardCount: { official: 159 } }])
      if (url.endsWith('/en/cards/swsh12-028')) return ok(mk('swsh12-028', 'Larvesta'))
      if (url.endsWith('/en/cards/swsh12-025')) return ok(mk('swsh12-025', 'Volcarona'))
      return { ok: false, status: 404, json: async () => ({}) }
    }))
    const res = await findCards({ names: ['WVolcarona'], number: 28, total: 159, candidates: [{ number: 25, total: 159 }], lang: 'en' })
    expect(res[0].name).toBe('Volcarona')
    vi.unstubAllGlobals()
  })
  it('Nummerneingabe mit Schrägstrich', () => {
    expect(parseNumberInput('025/159')).toEqual({ number: 25, total: 159 })
    expect(parseNumberInput(' 25 / 159 ')).toEqual({ number: 25, total: 159 })
    expect(parseNumberInput('25')).toEqual({ number: 25, total: undefined })
    expect(parseNumberInput('')).toEqual({})
  })
  it('wählt Hauptkamera statt Weitwinkel', () => {
    const d = (deviceId: string, label: string) => ({ kind: 'videoinput', deviceId, label }) as MediaDeviceInfo
    const list = [d('a', 'camera2 2, facing back'), d('b', 'camera2 0, facing back'), d('c', 'camera2 1, facing front')]
    expect(pickMainCamera(list)?.deviceId).toBe('b')
    expect(pickMainCamera(list, 'a')?.deviceId).toBe('a')
    const ios = [d('x', 'Back Ultra Wide Camera'), d('y', 'Back Camera'), d('z', 'Front Camera')]
    expect(pickMainCamera(ios)?.deviceId).toBe('y')
  })
})

import { adaptiveThreshold } from './scan'
describe('Binarisierung', () => {
  it('dunkler Text auf Verlauf wird schwarz, Verlauf weiß', () => {
    const w = 40, h = 10
    const g: number[] = []
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.push(x === 20 ? 30 : 100 + x * 3) // Verlauf + dunkle Linie
    const out = adaptiveThreshold(g, w, h, 5, 25)
    expect(out[5 * w + 20]).toBe(0)
    expect(out[5 * w + 5]).toBe(255)
    expect(out[5 * w + 35]).toBe(255)
  })
})

import { rarityInfo, formatNumber } from './rarity'
describe('Seltenheit & Sondernummern', () => {
  it('Seltenheitssymbole DE/EN', () => {
    expect(rarityInfo('Common')).toMatchObject({ symbol: '●', color: 'black' })
    expect(rarityInfo('Häufig')).toMatchObject({ symbol: '●' })
    expect(rarityInfo('Uncommon')).toMatchObject({ symbol: '◆' })
    expect(rarityInfo('Nicht so häufig')).toMatchObject({ symbol: '◆' })
    expect(rarityInfo('Rare')).toMatchObject({ symbol: '★', color: 'black' })
    expect(rarityInfo('Double rare')).toMatchObject({ symbol: '★★', color: 'black' })
    expect(rarityInfo('Ultra Rare')).toMatchObject({ symbol: '★★', color: 'silver' })
    expect(rarityInfo('Illustration rare')).toMatchObject({ symbol: '★', color: 'gold' })
    expect(rarityInfo('Special illustration rare')).toMatchObject({ symbol: '★★', color: 'gold' })
    expect(rarityInfo('Hyper rare')).toMatchObject({ symbol: '★★★', color: 'gold' })
    expect(rarityInfo('None')).toBeUndefined()
    expect(rarityInfo('')).toBeUndefined()
  })
  it('vollständige Nummern', () => {
    expect(formatNumber('025', 159)).toBe('025/159')
    expect(formatNumber('201', 198)).toBe('201/198')
    expect(formatNumber('TG05', 30)).toBe('TG05/TG30')
    expect(formatNumber('SWSH062', 300)).toBe('SWSH062')
    expect(formatNumber('25')).toBe('25')
  })
  it('liest Gallery-, Secret- und Nummern hinter Regulierungszeichen', () => {
    expect(numberMatches('F 025/159 ★')).toEqual([{ number: 25, total: 159 }])
    expect(numberMatches('TG05/TG30')).toEqual([{ number: 5, total: 30, prefix: 'TG' }])
    expect(numberMatches('201/198')).toEqual([{ number: 201, total: 198 }])
    expect(parseOcr('', 'SWSH062').promoCode).toBe('SWSH062')
    expect(parseNumberInput('TG05/TG30')).toEqual({ number: 5, total: 30, prefix: 'TG' })
    expect(parseNumberInput('swsh062')).toEqual({ number: 62, promoCode: 'SWSH062' })
  })
  it('findet Gallery- und Promokarten', async () => {
    clearSetCache()
    const mk = (id: string, localId: string, name: string, total: number) => ({ id, localId, name, set: { cardCount: { official: total } }, pricing: {} })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j })
      if (url.endsWith('/en/sets')) return ok([
        { id: 'swsh9tg', name: 'Brilliant Stars Trainer Gallery', cardCount: { official: 30 } },
        { id: 'swshp', name: 'SWSH Black Star Promos', cardCount: { official: 307 } },
      ])
      if (url.endsWith('/en/cards/swsh9tg-TG05')) return ok(mk('swsh9tg-TG05', 'TG05', 'Pikachu', 30))
      if (url.endsWith('/en/cards/swshp-SWSH062')) return ok(mk('swshp-SWSH062', 'SWSH062', 'Pikachu V', 307))
      return { ok: false, status: 404, json: async () => ({}) }
    }))
    expect((await findCards({ names: [], number: 5, total: 30, prefix: 'TG', lang: 'en' }))[0]?.id).toBe('swsh9tg-TG05')
    expect((await findCards({ names: [], promoCode: 'SWSH062', lang: 'en' }))[0]?.id).toBe('swshp-SWSH062')
    vi.unstubAllGlobals()
  })
})
