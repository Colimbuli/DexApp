import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from './db'
import { useLive } from './hooks'
import { getCardCached, getSetCached, getSets } from './cache'
import type { SetDetail } from './tcgdex'
import type { CardInfo, CollectionEntry, Lang } from './types'
import { basePrice, fmtEur, unitValue } from './pricing'
import { formatNumber, rarityInfo } from './rarity'
import { Filters } from './Filters'
import { applyFilters, FACETS, type FilterState } from './filters'
import { useLangChoice } from './LangSelect'

const SET_KEY = 'checklistSet'
const setIdOf = (e: CollectionEntry) => e.setId ?? e.cardId.replace(/-[^-]+$/, '')
const CHECK_FACETS = FACETS.filter((f) => ['type', 'stage', 'rarity', 'reg', 'illus'].includes(f.key))

type Owned = 'all' | 'owned' | 'missing'

export function Checklist({ profileId, onPick }: { profileId: number; onPick: (c: CardInfo) => void }) {
  const entries = useLive(() => db.entries.where('profileId').equals(profileId).toArray(), [profileId], [] as CollectionEntry[])
  const [langChoice] = useLangChoice()
  const lang: Lang = langChoice === 'en' ? 'en' : 'de'
  const [sets, setSets] = useState<{ id: string; name: string }[]>([])
  const [setId, setSetId] = useState<string>(() => { try { return localStorage.getItem(SET_KEY) ?? '' } catch { return '' } })
  const [setQ, setSetQ] = useState('')
  const [detail, setDetail] = useState<SetDetail>()
  const [cards, setCards] = useState<Record<string, CardInfo | null>>({})
  const [err, setErr] = useState('')
  const [owned, setOwned] = useState<Owned>('all')
  const [bothLangs, setBothLangs] = useState(true)
  const [filters, setFilters] = useState<FilterState>({})
  const queue = useRef<string[]>([])
  const running = useRef(0)
  const requested = useRef(new Set<string>())

  useEffect(() => { getSets(lang).then((s) => setSets([...s].reverse())).catch(() => setErr('Setliste nicht ladbar – Internet prüfen.')) }, [lang])

  useEffect(() => {
    try { localStorage.setItem(SET_KEY, setId) } catch { /* egal */ }
    setDetail(undefined); setCards({}); setErr('')
    requested.current = new Set(); queue.current = []
    if (!setId) return
    getSetCached(setId, lang).then((d) => (d ? setDetail(d) : setErr('Set nicht gefunden.'))).catch(() => setErr('Set nicht ladbar – Internet prüfen.'))
  }, [setId, lang])

  // Warteschlange: max. 4 gleichzeitige Kartenabfragen
  const pump = useCallback(() => {
    while (running.current < 4 && queue.current.length) {
      const id = queue.current.shift()!
      running.current++
      getCardCached(id, lang)
        .then((c) => setCards((m) => ({ ...m, [id]: c ?? null })))
        .catch(() => setCards((m) => ({ ...m, [id]: null })))
        .finally(() => { running.current--; pump() })
    }
  }, [lang])

  const load = useCallback((ids: string[]) => {
    for (const id of ids) if (!requested.current.has(id)) { requested.current.add(id); queue.current.push(id) }
    pump()
  }, [pump])

  /** Sichtbare Karte vorziehen, falls sie noch in der Warteschlange steht */
  const prioritize = useCallback((id: string) => {
    const i = queue.current.indexOf(id)
    if (i > 0) { queue.current.splice(i, 1); queue.current.unshift(id) }
    else if (i < 0) load([id])
  }, [load])

  // nach dem Öffnen eines Sets alle Kartendaten/Preise im Hintergrund laden
  useEffect(() => {
    if (detail) load(detail.cards.map((c) => c.id))
  }, [detail, load])

  // Besitz: Karten-ID → Anzahl (optional nur aktuelle Katalogsprache)
  const ownedQty = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) {
      if (!bothLangs && (e.lang ?? 'de') !== lang) continue
      m.set(e.cardId, (m.get(e.cardId) ?? 0) + e.qty)
    }
    return m
  }, [entries, bothLangs, lang])

  const yourSetIds = useMemo(() => new Set(entries.map(setIdOf)), [entries])
  const setOptions = useMemo(() => {
    const q = setQ.toLowerCase()
    const f = sets.filter((s) => !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
    return [...f.filter((s) => yourSetIds.has(s.id)), ...f.filter((s) => !yourSetIds.has(s.id))]
  }, [sets, setQ, yourSetIds])

  const list = detail?.cards ?? []
  const loaded = list.map((c) => cards[c.id]).filter((c): c is CardInfo => !!c)
  const facetActive = Object.values(filters).some(Boolean)
  const shown = list.filter((c) => {
    const has = ownedQty.has(c.id)
    if (owned === 'owned' && !has) return false
    if (owned === 'missing' && has) return false
    if (!facetActive) return true
    const info = cards[c.id]
    return !!info && applyFilters([info], CHECK_FACETS, filters).length === 1
  })

  const ownedCount = list.filter((c) => ownedQty.has(c.id)).length
  const setEntries = entries.filter((e) => setIdOf(e) === setId && (bothLangs || (e.lang ?? 'de') === lang))
  const ownedValue = setEntries.reduce((s, e) => s + (unitValue(e) ?? 0) * e.qty, 0)
  const missingCards = list.filter((c) => !ownedQty.has(c.id))
  const missingLoaded = missingCards.filter((c) => cards[c.id] !== undefined)
  const missingValue = missingLoaded.reduce((s, c) => s + (basePrice(cards[c.id]?.pricing ?? {}, false) ?? 0), 0)
  const pctRaw = list.length ? (ownedCount / list.length) * 100 : 0
  const pct = pctRaw.toLocaleString('de-DE', { maximumFractionDigits: pctRaw > 0 && pctRaw < 10 ? 1 : 0 })
  const loadedAll = list.filter((c) => cards[c.id] !== undefined).length
  const failed = missingCards.filter((c) => cards[c.id] === null).length
  const complete = missingLoaded.length === missingCards.length && failed === 0

  return (
    <main>
      <h1>Set-Checkliste</h1>
      <div className="toolbar">
        <input placeholder="Set suchen …" value={setQ} onChange={(e) => setSetQ(e.target.value)} />
      </div>
      <select value={setId} onChange={(e) => setSetId(e.target.value)} style={{ marginBottom: 10 }}>
        <option value="">– Set wählen –</option>
        {setOptions.map((s) => <option key={s.id} value={s.id}>{yourSetIds.has(s.id) ? '● ' : ''}{s.name} ({s.id})</option>)}
      </select>
      {err && <p className="err">{err}</p>}
      {!setId && <p className="muted">Sets, aus denen du Karten besitzt, stehen oben (●). Katalogsprache: {lang.toUpperCase()} (Umschalten unter Suche).</p>}
      {detail && (
        <>
          <div className="card">
            <strong>{detail.name}</strong>
            <div className="muted">{[detail.serie?.name, detail.releaseDate?.slice(0, 4), detail.abbreviation?.official].filter(Boolean).join(' · ')}</div>
            <div className="progress"><div style={{ width: `${pctRaw}%` }} /></div>
            <div className="row" style={{ marginTop: 6 }}>
              <div><div className="muted">Besitz</div><strong>{ownedCount}/{list.length}</strong> <span className="muted">({pct} %)</span></div>
              <div><div className="muted">Wert Besitz</div><span className="price">{fmtEur(ownedValue)}</span></div>
              <div><div className="muted">Fehlend</div><span className="price">{complete ? '' : 'mind. '}{fmtEur(missingValue)}</span></div>
            </div>
            {complete === false && loadedAll === list.length && failed > 0 && (
              <div className="muted" style={{ marginTop: 8 }}>{failed} Karten ohne Daten (Abruf fehlgeschlagen) – Wert unvollständig. Set neu öffnen, um es erneut zu versuchen.</div>
            )}
            {loadedAll < list.length && (
              <div style={{ marginTop: 8 }}>
                <div className="muted">Preise werden geladen: {loadedAll}/{list.length}</div>
                <div className="progress loading"><div style={{ width: `${(loadedAll / list.length) * 100}%` }} /></div>
              </div>
            )}
          </div>
          <Filters
            items={loaded}
            facets={CHECK_FACETS}
            state={filters}
            onChange={setFilters}
            extra={
              <>
                <label>Besitz
                  <select value={owned} onChange={(e) => setOwned(e.target.value as Owned)}>
                    <option value="all">Alle</option>
                    <option value="owned">Vorhanden</option>
                    <option value="missing">Fehlend</option>
                  </select>
                </label>
                <label>Besitz zählt
                  <select value={bothLangs ? 'both' : 'one'} onChange={(e) => setBothLangs(e.target.value === 'both')}>
                    <option value="both">DE + EN</option>
                    <option value="one">nur {lang.toUpperCase()}</option>
                  </select>
                </label>
              </>
            }
          />
          {facetActive && loaded.length < list.length && (
            <p className="muted">Filter berücksichtigen nur Karten mit geladenen Daten ({loaded.length}/{list.length}).</p>
          )}
          <div className="grid">
            {shown.map((c) => (
              <Tile key={c.id} card={c} info={cards[c.id]} qty={ownedQty.get(c.id) ?? 0} total={detail.cardCount?.official}
                onVisible={() => prioritize(c.id)}
                onPick={async () => {
                  const info = cards[c.id] ?? (await getCardCached(c.id, lang))
                  if (info) onPick(info)
                }} />
            ))}
          </div>
        </>
      )}
    </main>
  )
}

function Tile({ card, info, qty, total, onVisible, onPick }: {
  card: SetDetail['cards'][number]
  info: CardInfo | null | undefined
  qty: number
  total?: number
  onVisible: () => void
  onPick: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || info !== undefined) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { onVisible(); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [info, onVisible])
  const r = rarityInfo(info?.rarity)
  return (
    <button ref={ref} className={`tile${qty ? '' : ' missing'}`} onClick={onPick} title={card.name}>
      {card.image ? <img src={card.image} alt={card.name} loading="lazy" /> : <div className="noimg">{card.name}</div>}
      {qty > 0 && <span className="qty">{qty}×</span>}
      <span className="tile-info">
        <span>{formatNumber(card.localId, total)}{r && <span className={`r-${r.color} tile-r`}> {r.symbol}</span>}</span>
        <span className="price">{info === undefined ? '…' : fmtEur(basePrice(info?.pricing ?? {}, false))}</span>
      </span>
    </button>
  )
}
