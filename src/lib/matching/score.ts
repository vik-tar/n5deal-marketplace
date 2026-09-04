import type {
  AssetCriteria,
  MandateCriteria,
  MatchReason,
  MatchReasonCode,
  MatchResult,
} from './types'

export const MATCH_WEIGHTS: Record<MatchReasonCode, number> = {
  CATEGORY: 30,
  COUNTRY: 20,
  PRICE: 25,
  BUSINESS_STATUS: 15,
  LICENCE_TYPE: 10,
}

/** How far outside the ticket band still earns partial credit. */
export const PRICE_TOLERANCE = 0.2

const STRONG_THRESHOLD = 70
const GOOD_THRESHOLD = 45

function membershipReason<T>(
  code: MatchReasonCode,
  preferences: readonly T[],
  value: T,
): MatchReason {
  const weight = MATCH_WEIGHTS[code]
  if (preferences.length === 0) {
    return { code, kind: 'NO_PREFERENCE', weight, earned: weight }
  }
  const hit = preferences.includes(value)
  return { code, kind: hit ? 'MATCH' : 'MISMATCH', weight, earned: hit ? weight : 0 }
}

function priceReason(
  minCents: number | null,
  maxCents: number | null,
  priceCents: number,
): MatchReason {
  const code: MatchReasonCode = 'PRICE'
  const weight = MATCH_WEIGHTS.PRICE

  if (minCents === null && maxCents === null) {
    return { code, kind: 'NO_PREFERENCE', weight, earned: weight }
  }

  const lower = minCents ?? 0
  const upper = maxCents ?? Number.POSITIVE_INFINITY
  if (priceCents >= lower && priceCents <= upper) {
    return { code, kind: 'MATCH', weight, earned: weight }
  }

  const tolerantLower = lower * (1 - PRICE_TOLERANCE)
  const tolerantUpper =
    upper === Number.POSITIVE_INFINITY ? upper : upper * (1 + PRICE_TOLERANCE)
  if (priceCents >= tolerantLower && priceCents <= tolerantUpper) {
    return { code, kind: 'PARTIAL', weight, earned: weight / 2 }
  }

  return { code, kind: 'MISMATCH', weight, earned: 0 }
}

/** Counts the criteria the mandate actually constrains. */
function countSpecificity(mandate: MandateCriteria): number {
  return (
    (mandate.categories.length > 0 ? 1 : 0) +
    (mandate.countries.length > 0 ? 1 : 0) +
    (mandate.licenceTypes.length > 0 ? 1 : 0) +
    (mandate.businessStatuses.length > 0 ? 1 : 0) +
    (mandate.ticketMinCents !== null || mandate.ticketMaxCents !== null ? 1 : 0)
  )
}

/**
 * Scores how well a listing fits a buyer's mandate.
 * Pure: the same inputs always produce the same score, so buyer-side and
 * seller-side views of the same pair never disagree.
 */
export function scoreMatch(
  mandate: MandateCriteria,
  asset: AssetCriteria,
): MatchResult {
  const reasons: MatchReason[] = [
    membershipReason('CATEGORY', mandate.categories, asset.category),
    membershipReason('COUNTRY', mandate.countries, asset.country),
    priceReason(mandate.ticketMinCents, mandate.ticketMaxCents, asset.askingPriceCents),
    membershipReason('BUSINESS_STATUS', mandate.businessStatuses, asset.businessStatus),
    membershipReason('LICENCE_TYPE', mandate.licenceTypes, asset.licenceType),
  ]

  const score = Math.round(reasons.reduce((sum, r) => sum + r.earned, 0))
  const band =
    score >= STRONG_THRESHOLD ? 'STRONG' : score >= GOOD_THRESHOLD ? 'GOOD' : 'NONE'

  return { score, band, specificity: countSpecificity(mandate), reasons }
}
