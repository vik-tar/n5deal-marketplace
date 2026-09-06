import type {
  AssetCriteria,
  MandateCriteria,
  MatchBand,
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

/**
 * Counts the criteria the mandate actually constrains, 0-5. Exported (not just
 * an internal step of `scoreMatch`) because Task 16's profile page needs it on
 * its own, independent of any one asset: the same number that tells a
 * consumer of `MatchResult` "don't rank on this score alone" is also what the
 * mandate-editing form itself must show the buyer, on the mandate that is
 * about to become every future match's input — re-deriving this count inline
 * there would duplicate the one definition of "constrains nothing" this
 * module exists to own.
 */
export function mandateSpecificity(mandate: MandateCriteria): number {
  return (
    (mandate.categories.length > 0 ? 1 : 0) +
    (mandate.countries.length > 0 ? 1 : 0) +
    (mandate.licenceTypes.length > 0 ? 1 : 0) +
    (mandate.businessStatuses.length > 0 ? 1 : 0) +
    (mandate.ticketMinCents !== null || mandate.ticketMaxCents !== null ? 1 : 0)
  )
}

/**
 * Whether a ranked list scored against this mandate means anything at all.
 *
 * At `specificity` 0 the mandate constrains nothing, so every criterion
 * returns `NO_PREFERENCE` and earns its full weight: *every* listing scores
 * exactly 100 and lands in the `STRONG` band. A list ordered by that number
 * is not a weak ranking, it is a fabricated one — the order comes entirely
 * from the tie-break, and the badges tell the buyer five different listings
 * are all a strong match when nothing was ever compared.
 *
 * Lives here, next to `mandateSpecificity`, rather than as an inline
 * `specificity === 0` test at each call site: Task 18's rule is enforced in
 * two places that must not drift — `getRecommendedAssets`
 * (`@/server/queries/assets`) declines to build the ranking at all, and
 * `BuyerDashboard` renders the "complete your mandate" prompt in its place —
 * and one definition of "rankable" is what keeps a future change to one from
 * silently disagreeing with the other.
 */
export function isMandateRankable(specificity: number): boolean {
  return specificity > 0
}

/**
 * The bands worth putting in front of someone as a recommendation. `NONE` is
 * the band `scoreMatch` assigns below 45 — the listing (or buyer) failed
 * enough of the mandate's real constraints that surfacing it as a suggestion
 * would be noise, so both directions of the match drop it: a buyer's
 * recommended listings (`getRecommendedAssets`) and a seller's top matched
 * buyers for a listing (the seller dashboard's slice of `listBuyers`).
 *
 * Note the asymmetry with the catalogs, which is deliberate: `/listings` and
 * `/buyers` are browsing surfaces and still show every row a filter admits,
 * `NONE`-banded or not, because the user asked for that list. A
 * recommendation is the app volunteering an opinion, and an opinion of "no
 * match" is not worth volunteering.
 */
export const RECOMMENDABLE_BANDS: readonly MatchBand[] = ['STRONG', 'GOOD']

export function isRecommendableMatch(result: MatchResult): boolean {
  return RECOMMENDABLE_BANDS.includes(result.band)
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

  return { score, band, specificity: mandateSpecificity(mandate), reasons }
}
