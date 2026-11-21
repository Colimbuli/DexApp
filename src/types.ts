export type Lang = 'de' | 'en'
export type LangChoice = Lang | 'both'

export const LANG_LABEL: Record<Lang, string> = { de: 'DE', en: 'EN' }

export type Condition = 'MT' | 'NM' | 'EX' | 'GD' | 'LP' | 'PL' | 'PO'

export interface CardPricing {
  /** Cardmarket-Trendpreis in EUR (Normalversion) */
  eur?: number
  /** Cardmarket-Trendpreis in EUR (Holo/Reverse Holo) */
  eurHolo?: number
  updated?: string
}

export interface CardInfo {
  id: string
  lang: Lang
  name: string
  localId: string
  setName?: string
  setTotal?: number
  image?: string
  rarity?: string
  setId?: string
  /** Pokémon, Trainer, Energie (Katalogsprache) */
  category?: string
  /** Basis, Phase 1, Phase 2 … */
  stage?: string
  types?: string[]
  hp?: number
  illustrator?: string
  regulationMark?: string
  pricing: CardPricing
}

/** Kartendaten, die zusätzlich zur Sammlung gespeichert und gefiltert werden */
export interface CardDetails {
  setId?: string
  category?: string
  stage?: string
  types?: string[]
  hp?: number
  illustrator?: string
  regulationMark?: string
  year?: number
}

export interface Profile {
  id?: number
  name: string
  salt?: string
  pinHash?: string
}

export interface CollectionEntry extends CardDetails {
  id?: number
  profileId: number
  cardId: string
  lang: Lang
  name: string
  setName: string
  localId: string
  setTotal?: number
  /** Seltenheit laut Katalog; '' = unbekannt, undefined = noch nicht ermittelt */
  rarity?: string
  /** Version der ergänzten Kartendaten; fehlt/kleiner → im Hintergrund nachladen */
  infoV?: number
  image?: string
  qty: number
  condition: Condition
  holo: boolean
  /** Basispreis (Near Mint) zum Zeitpunkt der letzten Aktualisierung */
  basePrice?: number
  baseHoloPrice?: number
  priceUpdated?: string
  addedAt: string
}
