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

/**
 * The five criteria and the four verdicts, as runtime values with the types
 * derived from them rather than the other way round.
 *
 * `explainMatchAction` (`@/server/actions/ai`) has to *validate* a
 * `MatchReason[]` that arrived from a client — a Server Action is a public
 * endpoint, so the reasons it forwards to the model are caller-supplied — and
 * a zod `enum` needs its members at runtime, not only at compile time.
 *
 * Deriving the type from the array instead of declaring both keeps them from
 * drifting: adding a
 * criterion here widens `MatchReasonCode`, and `MATCH_WEIGHTS`
 * (`@/lib/matching/score`) is a `Record` over it, so a new code without a
 * weight is a compile error rather than a silently unscored criterion.
 */
export const MATCH_REASON_CODES = [
  'CATEGORY',
  'COUNTRY',
  'PRICE',
  'BUSINESS_STATUS',
  'LICENCE_TYPE',
] as const

export type MatchReasonCode = (typeof MATCH_REASON_CODES)[number]

export const MATCH_REASON_KINDS = ['MATCH', 'PARTIAL', 'MISMATCH', 'NO_PREFERENCE'] as const

export type MatchReasonKind = (typeof MATCH_REASON_KINDS)[number]

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
  /**
   * How many of the five criteria the mandate actually constrains, 0-5.
   * A score of 100 at specificity 0 means "this mandate excludes nothing",
   * not "this is a strong fit" — consumers must not rank on score alone.
   */
  specificity: number
  reasons: MatchReason[]
}
