import { useEffect, useMemo, useRef, useState } from 'react'
import { backfillCardInfo, db, exportBackup, importBackup, refreshPrices } from './db'
import { useLive, download } from './hooks'
import type { CollectionEntry, Condition, LangChoice } from './types'
import { CONDITION_LABEL, fmtEur, totalValue, unitValue } from './pricing'
import { getCard } from './tcgdex'
import { toCsv } from './csv'
import { LangBadge } from './LangSelect'
import { RarityBadge } from './Rarity'
import { formatNumber } from './rarity'
import { openImage } from './ImageViewer'

export function Collection({ profileId }: { profileId: number }) {
  const entries = useLive(() => db.entries.where('profileId').equals(profileId).toArray(), [profileId], [] as CollectionEntry[])
  const [q, setQ] = useState('')
  const [langF, setLangF] = useState<LangChoice>('both')
  const [sort, setSort] = useState<'added' | 'value' | 'name'>('added')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const backfilled = useRef(false)

  // ältere Einträge ohne Seltenheit/Setgröße einmal pro Aufruf im Hintergrund ergänzen
  useEffect(() => {
    if (backfilled.current || !entries.some((e) => e.rarity === undefined) || !navigator.onLine) return
    backfilled.current = true
    backfillCardInfo(profileId, getCard).catch(() => {})
  }, [entries, profileId])

  const shown = useMemo(() => {
    const f = entries.filter(
      (e) => (langF === 'both' || (e.lang ?? 'de') === langF) && (e.name + ' ' + e.setName).toLowerCase().includes(q.toLowerCase()),
    )
    const by = {
      added: (a: CollectionEntry, b: CollectionEntry) => b.addedAt.localeCompare(a.addedAt),
      value: (a: CollectionEntry, b: CollectionEntry) => (unitValue(b) ?? 0) * b.qty - (unitValue(a) ?? 0) * a.qty,
      name: (a: CollectionEntry, b: CollectionEntry) => a.name.localeCompare(b.name, 'de'),
    }[sort]
    return f.sort(by)
  }, [entries, q, sort, langF])

  const count = entries.reduce((s, e) => s + e.qty, 0)
  const missing = entries.filter((e) => unitValue(e) === undefined).length

  async function update() {
    setBusy(true); setMsg('Aktualisiere …')
    try {
      const r = await refreshPrices(profileId, getCard, (d, t) => setMsg(`Aktualisiere ${d}/${t} …`))
      setMsg(`${r.updated} Karten aktualisiert${r.failed ? `, ${r.failed} fehlgeschlagen` : ''}.`)
    } finally { setBusy(false) }
  }

  async function restore(f?: File) {
    if (!f) return
    try {
      const n = await importBackup(profileId, JSON.parse(await f.text()))
      setMsg(`${n} Einträge importiert.`)
    } catch (e) { setMsg((e as Error).message) }
  }

  return (
    <main>
      <h1>Sammlung</h1>
      <div className="card">
        <div className="muted">{count} Karten · {entries.length} Einträge</div>
        <div className="total">{fmtEur(totalValue(entries))}</div>
        <div className="muted">Schätzwert nach Cardmarket-Trend, angepasst an den Zustand.{missing ? ` ${missing} Einträge ohne Preis.` : ''}</div>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input placeholder="Filtern …" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 2 }} />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="added">Neueste</option>
          <option value="value">Wert</option>
          <option value="name">Name</option>
        </select>
        <select value={langF} onChange={(e) => setLangF(e.target.value as LangChoice)}>
          <option value="both">DE + EN</option>
          <option value="de">Nur DE</option>
          <option value="en">Nur EN</option>
        </select>
      </div>
      {shown.map((e) => <Row key={e.id} e={e} />)}
      {entries.length === 0 && <p className="muted">Noch leer. Karten über „Scan“ oder „Suche“ hinzufügen.</p>}
      <h2 style={{ marginTop: 24 }}>Verwalten</h2>
      <div className="row">
        <button onClick={update} disabled={busy || !entries.length}>Preise aktualisieren</button>
        <button onClick={() => download('sammlung.csv', 'text/csv;charset=utf-8', toCsv(entries))} disabled={!entries.length}>CSV</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={async () => download('sammlung-backup.json', 'application/json', JSON.stringify(await exportBackup(profileId)))} disabled={!entries.length}>
          Backup speichern
        </button>
        <label style={{ margin: 0 }}>
          <input type="file" accept="application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
          <span style={{ display: 'block', background: 'var(--panel2)', color: 'var(--text)', padding: '10px 14px', borderRadius: 8, textAlign: 'center', cursor: 'pointer' }}>Backup laden</span>
        </label>
      </div>
      <p className="muted">Browserdaten können gelöscht werden (Cache leeren, Speicherplatz knapp). Regelmäßig ein Backup speichern.</p>
      {msg && <p>{msg}</p>}
    </main>
  )
}

function Row({ e }: { e: CollectionEntry }) {
  const u = unitValue(e)
  return (
    <div className="card item">
      {e.image && <img src={e.image} alt="" loading="lazy" onClick={() => openImage(e.image)} />}
      <div className="grow">
        <strong>{e.name}</strong><LangBadge lang={e.lang} />
        <div className="muted">{e.setName} · {formatNumber(e.localId, e.setTotal)}<RarityBadge rarity={e.rarity} /></div>
        <div className="row" style={{ marginTop: 4 }}>
          <select value={e.condition} onChange={(ev) => db.entries.update(e.id!, { condition: ev.target.value as Condition })} style={{ padding: 4 }}>
            {(Object.keys(CONDITION_LABEL) as Condition[]).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" min={1} value={e.qty} style={{ padding: 4 }}
            onChange={(ev) => db.entries.update(e.id!, { qty: Math.max(1, Math.floor(+ev.target.value) || 1) })} />
        </div>
        {e.holo && <span className="muted">Holo</span>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="price">{fmtEur(u === undefined ? undefined : u * e.qty)}</div>
        {e.qty > 1 && <div className="muted">je {fmtEur(u)}</div>}
        <button className="danger" style={{ padding: '4px 8px', marginTop: 4 }}
          onClick={() => confirm(`„${e.name}“ entfernen?`) && db.entries.delete(e.id!)}>✕</button>
      </div>
    </div>
  )
}
