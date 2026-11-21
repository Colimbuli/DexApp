export interface NumberCandidate {
  number: number
  total: number
  votes: number
}

export interface ParsedOcr {
  number?: number
  total?: number
  promoCode?: string
  names: string[]
  /** alle gelesenen „Nummer/Gesamt“-Varianten, häufigste zuerst */
  candidates?: NumberCandidate[]
}

/** Alle „025/159“-Muster eines Textes. */
export function numberMatches(text: string): { number: number; total: number }[] {
  return [...text.matchAll(/(\d{1,3})\s*[\/|]\s*(\d{2,3})/g)]
    .map((m) => ({ number: parseInt(m[1], 10), total: parseInt(m[2], 10) }))
    .filter((c) => c.total >= 10 && c.number > 0 && c.number <= c.total + 150)
}

/** Zählt gleiche Lesungen zusammen; häufigste zuerst. */
export function vote(reads: { number: number; total: number }[]): NumberCandidate[] {
  const m = new Map<string, NumberCandidate>()
  for (const r of reads) {
    const k = `${r.number}/${r.total}`
    const c = m.get(k) ?? { ...r, votes: 0 }
    c.votes++
    m.set(k, c)
  }
  return [...m.values()].sort((a, b) => b.votes - a.votes)
}

const STOP = new Set(
  [
    'kp', 'basis', 'phase', 'entwicklung', 'pokémon', 'pokemon', 'trainer', 'energie', 'fähigkeit', 'angriff',
    'schwäche', 'resistenz', 'rückzug', 'unterstützer', 'item', 'stadion', 'werkzeug', 'entwickelt', 'aus',
    'ex', 'gx', 'vmax', 'vstar', 'illus', 'regel', 'regeln', 'nicht', 'der', 'die', 'das', 'und', 'von', 'wenn',
    'hp', 'basic', 'stage', 'evolves', 'from', 'ability', 'attack', 'weakness', 'resistance', 'retreat',
    'supporter', 'stadium', 'tool', 'energy', 'the', 'and', 'your', 'opponent', 'opponent\'s', 'active', 'card', 'cards',
    'flip', 'coin', 'damage', 'rule', 'this', 'pokemon\'s', 'pokémon\'s', 'put', 'into', 'play',
    'dein', 'deine', 'deiner', 'gegnerische', 'gegnerischen', 'aktive', 'aktiven', 'karte', 'karten', 'münzwurf',
  ].map((s) => s.toLowerCase()),
)

/** Zerlegt OCR-Rohtext in Sammlernummer und Namenskandidaten. */
export function parseOcr(top: string, bottom: string): ParsedOcr {
  const out: ParsedOcr = { names: [] }

  const all = `${bottom}\n${top}`
  const m = all.match(/(\d{1,3})\s*[\/|]\s*(\d{2,3})/)
  if (m) {
    out.number = parseInt(m[1], 10)
    out.total = parseInt(m[2], 10)
  } else {
    const p = all.match(/\b(SWSH|SVP|SV|SM|XY|BW|HGSS|DP|TG|GG)\s?-?(\d{1,3})\b/i)
    if (p) {
      out.promoCode = (p[1] + p[2]).toUpperCase()
      out.number = parseInt(p[2], 10)
    }
  }

  const seen = new Set<string>()
  // „Evolves from X“ / „Entwickelt sich aus X“ nennt die Vorstufe, nicht diese Karte
  const lines = top
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/evolves|entwickelt/i.test(l))
  for (const line of lines.slice(0, 6)) {
    for (const raw of line.split(/\s+/)) {
      const tok = raw.replace(/^[^A-Za-zÄÖÜäöüß]+|[^A-Za-zÄÖÜäöüß]+$/g, '')
      if (tok.length < 3 || !/^[A-Za-zÄÖÜäöüéß'’.\-]+$/.test(tok)) continue
      const key = tok.toLowerCase()
      if (STOP.has(key) || seen.has(key)) continue
      seen.add(key)
      out.names.push(tok)
    }
  }
  // längere Tokens zuerst – Rauschen ist meist kurz
  out.names.sort((a, b) => b.length - a.length)
  return out
}
