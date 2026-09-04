import type { AssetCategory, BusinessStatus } from '@/generated/prisma/client'

/** The buyer's stated interests. Empty arrays and null bounds mean "no preference". */
export interface MandateCriteria {
  categories: AssetCategory[]
  countries: string[]
  licenceTypes: string[]
  businessStatuses: BusinessStatus[]
  ticketMinCents: number | null
  ticketMaxCents: number | null
}

/** The comparable facets of a listing. */
export interface AssetCriteria {
  category: AssetCategory
  country: string
  licenceType: string
  businessStatus: BusinessStatus
  askingPriceCents: number
}

export type MatchReasonCode =
  | 'CATEGORY'
  | 'COUNTRY'
  | 'PRICE'
  | 'BUSINESS_STATUS'
  | 'LICENCE_TYPE'

export type MatchReasonKind = 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'NO_PREFERENCE'

/** A translatable, machine-readable justification. Never a sentence. */
export interface MatchReason {
  code: MatchReasonCode
  kind: MatchReasonKind
  weight: number
  earned: number
}

export type MatchBand = 'STRONG' | 'GOOD' | 'NONE'

export interface MatchResult {
  score: number
  band: MatchBand
  reasons: MatchReason[]
}
