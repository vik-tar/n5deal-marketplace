import { z } from 'zod'
import { ASSET_CATEGORIES, BUSINESS_STATUSES } from '@/lib/filters/asset-filters'
import { countryCode, optionalHttpUrl, requiredText } from './primitives'

/** Bounds the brief spells out for the teaser copy. */
export const TEASER_TITLE_MIN = 10
export const TEASER_TITLE_MAX = 120
export const TEASER_DESCRIPTION_MIN = 40
export const TEASER_DESCRIPTION_MAX = 2000

/** A listing cannot pre-date the marketplace's own notion of "old enough to sell". */
export const MIN_YEAR_OF_ISSUE = 1900

/**
 * The ceiling on `yearOfIssue` — you cannot have been licensed in the future.
 *
 * A function rather than a constant because the form's `<input max>` is
 * re-evaluated on every render and should track the clock. `assetInputSchema`
 * below still captures it once at module load, exactly as the inline
 * `new Date().getFullYear()` it replaces always did, so a server process alive
 * across New Year's Eve keeps last year's ceiling until it restarts. That is
 * unchanged, known and out of scope here. What this fixes is narrower and
 * real: the browser's bound and the server's were two separate expressions
 * that happened to agree, and only one of them was in this file.
 */
export function maxYearOfIssue(): number {
  return new Date().getFullYear()
}

/** "included" is a short highlight list for the teaser card, not a data room index. */
export const MAX_INCLUDED_ITEMS = 8
export const MAX_INCLUDED_ITEM_LENGTH = 80

/** The seller's private working notes — long, but bounded, since it is a text column with a `@default("")`. */
export const MAX_CONFIDENTIAL_NOTES = 4000

/** The three free-text teaser identifiers (`licenceType`, `businessType`, `regulator`) share one ceiling. */
export const MAX_SHORT_TEXT = 120

/** The registered company name behind the teaser — released only with the confidential block. */
export const MAX_LEGAL_NAME = 200

/**
 * The single source of truth for what a listing may contain, shared by the
 * client form (for instant, per-field feedback) and `saveDraft` (`@/server/actions/assets`,
 * for the check that actually matters — this module never imports `@/server/db`,
 * so it stays reachable from a client component and from `tests/unit/validation/asset.test.ts`
 * with `DATABASE_URL` unset).
 *
 * Every confidential field the `Asset` model itself declares as required
 * (`legalName`, `revenueCents`, `ebitdaCents`, `clientCount`) is required here
 * too — a seller cannot save a draft that is missing them just because they
 * are less prominent in the form than the teaser fields above them.
 * `dataRoomUrl` and `confidentialNotes` stay optional, mirroring the nullable
 * column and the `@default("")` column they map to in `prisma/schema.prisma`.
 *
 * `revenueCents`/`ebitdaCents`/`askingPriceCents` are all non-negative: the
 * app's one money-input widget (`parseEuros`, `@/lib/money`) has no notion of
 * a negative amount (see its own tests), so a listing with a loss-making
 * EBITDA is out of scope for this prototype's form rather than silently
 * mis-parsed.
 */
export const assetInputSchema = z.object({
  // Public teaser — shown to every visitor.
  category: z.enum(ASSET_CATEGORIES),
  licenceType: requiredText(MAX_SHORT_TEXT),
  businessType: requiredText(MAX_SHORT_TEXT),
  country: countryCode,
  regulator: requiredText(MAX_SHORT_TEXT),
  businessStatus: z.enum(BUSINESS_STATUSES),
  askingPriceCents: z.number().int().positive(),
  employees: z.number().int().nonnegative(),
  yearOfIssue: z
    .number()
    .int()
    .min(MIN_YEAR_OF_ISSUE)
    .max(maxYearOfIssue()),
  included: z.array(requiredText(MAX_INCLUDED_ITEM_LENGTH)).max(MAX_INCLUDED_ITEMS),
  teaserTitle: z.string().trim().min(TEASER_TITLE_MIN).max(TEASER_TITLE_MAX),
  teaserDescription: z
    .string()
    .trim()
    .min(TEASER_DESCRIPTION_MIN)
    .max(TEASER_DESCRIPTION_MAX),

  // Confidential — released only once the seller approves a buyer's access request.
  legalName: requiredText(MAX_LEGAL_NAME),
  revenueCents: z.number().int().nonnegative(),
  ebitdaCents: z.number().int().nonnegative(),
  clientCount: z.number().int().nonnegative(),
  dataRoomUrl: optionalHttpUrl,
  confidentialNotes: z.string().trim().max(MAX_CONFIDENTIAL_NOTES),
})

export type AssetInput = z.infer<typeof assetInputSchema>
