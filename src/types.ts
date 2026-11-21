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
  name: string
  localId: string
  setName?: string
  setTotal?: number
  image?: string
  rarity?: string
  pricing: CardPricing
}

export interface Profile {
  id?: number
  name: string
  salt?: string
  pinHash?: string
}

export interface CollectionEntry {
  id?: number
  profileId: number
  cardId: string
  name: string
  setName: string
  localId: string
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
