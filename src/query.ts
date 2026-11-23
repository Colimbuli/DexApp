export interface EntryQuery {
  /** Freitext (Name, Set, Illustrator) */
  text: string
  number?: { prefix?: string; n: number; total?: number }
}

/**
 * Zerlegt die Sammlungssuche in Text und Kartennummer.
 * Erkannt werden „89/149“, „089“, „TG05/TG30“, „TG05“, „SWSH062“ – auch mit Name davor.
 */
export function parseEntryQuery(input: string): EntryQuery {
  let s = ` ${input.trim()} `
  let number: EntryQuery['number']
  const take = (re: RegExp, f: (m: RegExpMatchArray) => EntryQuery['number']) => {
    if (number) return
    const m = s.match(re)
    if (!m) return
    number = f(m)
    s = s.replace(m[0], ' ')
  }
  // Gallery: TG05, TG05/TG30
  take(/\s(TG|GG|RC|SV)\s?(\d{1,3})(?:\s*\/\s*(?:TG|GG|RC|SV)?\s?(\d{1,3}))?(?=\s)/i, (m) => ({
    prefix: m[1].toUpperCase(), n: parseInt(m[2], 10), total: m[3] ? parseInt(m[3], 10) : undefined,
  }))
  // Promo: SWSH062, SVP045 (Buchstaben direkt vor Ziffern)
  take(/\s([A-Za-z]{2,5})-?(\d{2,3})(?=\s)/, (m) => ({ prefix: m[1].toUpperCase(), n: parseInt(m[2], 10) }))
  // Normal: 89, 089/149, 89 / 149
  take(/\s(\d{1,3})(?:\s*\/\s*(\d{1,3}))?(?=\s)/, (m) => ({
    n: parseInt(m[1], 10), total: m[2] ? parseInt(m[2], 10) : undefined,
  }))
  return { text: s.trim().replace(/\s+/g, ' '), number }
}

export function matchesEntry(
  e: { name: string; setName?: string; illustrator?: string; localId: string; setTotal?: number },
  q: EntryQuery,
): boolean {
  if (q.text && !`${e.name} ${e.setName ?? ''} ${e.illustrator ?? ''}`.toLowerCase().includes(q.text.toLowerCase())) return false
  if (!q.number) return true
  const m = e.localId.toUpperCase().match(/^([A-Z]*)(\d+)$/)
  if (!m) return false
  const [, prefix, digits] = m
  if ((q.number.prefix ?? '') !== prefix) return false
  if (parseInt(digits, 10) !== q.number.n) return false
  return q.number.total === undefined || e.setTotal === q.number.total
}
