import { facetOptions, type Facet, type FilterState } from './filters'

/** Ausklappbare Filterleiste; zeigt nur Filter mit mindestens zwei Werten (oder aktive). */
export function Filters<T>({ items, facets, state, onChange, extra }: {
  items: T[]
  facets: Facet<T>[]
  state: FilterState
  onChange: (s: FilterState) => void
  extra?: React.ReactNode
}) {
  const active = Object.values(state).filter(Boolean).length
  const shown = facets
    .map((f) => ({ f, opts: facetOptions(items, f) }))
    .filter(({ f, opts }) => opts.length > 1 || state[f.key])
  return (
    <details className="filters">
      <summary>Filter{active ? ` (${active} aktiv)` : ''}</summary>
      <div className="filter-grid">
        {extra}
        {shown.map(({ f, opts }) => (
          <label key={f.key}>
            {f.label}
            <select value={state[f.key] ?? ''} onChange={(e) => onChange({ ...state, [f.key]: e.target.value })}>
              <option value="">Alle</option>
              {opts.map((o) => <option key={o} value={o}>{f.display ? f.display(o) : o}</option>)}
            </select>
          </label>
        ))}
      </div>
      {shown.length === 0 && !extra && <p className="muted">Noch keine Filterdaten – werden im Hintergrund ergänzt.</p>}
      {active > 0 && <button type="button" onClick={() => onChange({})} style={{ marginTop: 8 }}>Filter zurücksetzen</button>}
    </details>
  )
}
