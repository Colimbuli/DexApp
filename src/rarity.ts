export type RarityColor = 'black' | 'silver' | 'gold' | 'shiny' | 'special'

export interface RarityInfo {
  symbol: string
  color: RarityColor
  label: string
}

/** Reihenfolge wichtig: spezifische Muster vor allgemeinen („Ultraselten“ enthält „selten“). */
const RULES: [RegExp, string, RarityColor][] = [
  [/special illustration|besondere illustration|spezielle illustration/, '★★', 'gold'],
  [/illustration/, '★', 'gold'],
  [/hyper/, '★★★', 'gold'],
  [/shiny ultra|schillernd.*ultra/, '★★', 'shiny'],
  [/shiny|schillernd/, '★', 'shiny'],
  [/ultra/, '★★', 'silver'],
  [/double|doppel/, '★★', 'black'],
  [/secret|geheim/, '★', 'gold'],
  [/ace spec/, 'ACE', 'special'],
  [/radiant|strahlend/, '★', 'special'],
  [/amazing|fantastisch/, '★', 'special'],
  [/legend|prime|crown|krone/, '★', 'gold'],
  [/promo/, 'PR', 'special'],
  [/uncommon|nicht so häufig|ungewöhnlich/, '◆', 'black'],
  [/common|häufig/, '●', 'black'],
  [/rare|selten|holo/, '★', 'black'],
]

export function rarityInfo(rarity?: string): RarityInfo | undefined {
  if (!rarity || /^none$|^keine$/i.test(rarity)) return undefined
  const r = rarity.toLowerCase()
  for (const [re, symbol, color] of RULES) if (re.test(r)) return { symbol, color, label: rarity }
  return { symbol: '?', color: 'special', label: rarity }
}

const GALLERY = /^(TG|GG|RC|SV)(\d+)$/i

/**
 * Vollständige Kartennummer: „025/159“, Secret Rare „201/198“,
 * Gallery „TG05/TG30“; Promos („SWSH062“) ohne Gesamtzahl.
 */
export function formatNumber(localId: string, setTotal?: number): string {
  if (!setTotal) return localId
  if (/^\d+$/.test(localId)) return `${localId}/${String(setTotal).padStart(localId.length, '0')}`
  const g = localId.match(GALLERY)
  if (g) return `${localId}/${g[1].toUpperCase()}${String(setTotal).padStart(g[2].length, '0')}`
  return localId
}
