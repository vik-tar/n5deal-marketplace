import { z } from 'zod'
import { ASSET_CATEGORIES, BUSINESS_STATUSES } from '@/lib/filters/asset-filters'

/** Bounds the brief spells out for the teaser copy. */
export const TEASER_TITLE_MIN = 10
export const TEASER_TITLE_MAX = 120
export const TEASER_DESCRIPTION_MIN = 40
export const TEASER_DESCRIPTION_MAX = 2000

/** A listing cannot pre-date the marketplace's own notion of "old enough to sell". */
export const MIN_YEAR_OF_ISSUE = 1900

/** "included" is a short highlight list for the teaser card, not a data room index. */
export const MAX_INCLUDED_ITEMS = 8

const requiredText = (max: number) => z.string().trim().min(1).max(max)

/** ISO 3166-1 alpha-2, case-insensitive on input — normalised to upper case before validating the shape. */
const countryCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, 'Enter a 2-letter ISO country code.'))

/** Blank means "no data room yet" (`dataRoomUrl` is nullable in the schema); anything else must be a URL. */
const optionalDataRoomUrl = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, z.url().optional())

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
  licenceType: requiredText(120),
  businessType: requiredText(120),
  country: countryCode,
  regulator: requiredText(120),
  businessStatus: z.enum(BUSINESS_STATUSES),
  askingPriceCents: z.number().int().positive(),
  employees: z.number().int().nonnegative(),
  yearOfIssue: z
    .number()
    .int()
    .min(MIN_YEAR_OF_ISSUE)
    .max(new Date().getFullYear()),
  included: z.array(requiredText(80)).max(MAX_INCLUDED_ITEMS),
  teaserTitle: z.string().trim().min(TEASER_TITLE_MIN).max(TEASER_TITLE_MAX),
  teaserDescription: z
    .string()
    .trim()
    .min(TEASER_DESCRIPTION_MIN)
    .max(TEASER_DESCRIPTION_MAX),

  // Confidential — released only once the seller approves a buyer's access request.
  legalName: requiredText(200),
  revenueCents: z.number().int().nonnegative(),
  ebitdaCents: z.number().int().nonnegative(),
  clientCount: z.number().int().nonnegative(),
  dataRoomUrl: optionalDataRoomUrl,
  confidentialNotes: z.string().trim().max(4000),
})

export type AssetInput = z.infer<typeof assetInputSchema>
