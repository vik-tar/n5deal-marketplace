import { z } from 'zod'
import { ASSET_CATEGORIES, BUSINESS_STATUSES } from '@/lib/filters/asset-filters'
import { BUYER_TYPES, MANDATE_LICENCE_TYPES } from '@/lib/filters/buyer-filters'

/**
 * The single source of truth for what a buyer's profile and investment
 * mandate may contain, shared by the client form (`@/components/domain/mandate-form`,
 * for instant, per-field feedback) and the two Server Actions that actually
 * enforce it (`@/server/actions/profile`) — this module never imports
 * `@/server/db`, so it stays reachable from a client component and from
 * `tests/unit/validation/profile.test.ts` with `DATABASE_URL` unset, exactly
 * as `@/lib/validation/asset` (Task 15) already does.
 *
 * The mandate is not a settings form: `mandateSchema` below is the shape that
 * becomes `MandateCriteria` (`@/lib/matching`), the input to every
 * `scoreMatch` a buyer or seller will ever see. An empty array or a null
 * ticket bound is a deliberate, meaningful value here — "no preference" — not
 * an unfinished field; see `mandateSpecificity` (`@/lib/matching`) for the
 * count this schema's shape feeds.
 */

const requiredText = (max: number) => z.string().trim().min(1).max(max)

/** ISO 3166-1 alpha-2, case-insensitive on input — normalised to upper case, mirroring `@/lib/validation/asset`'s identical rule for a listing's own jurisdiction. */
const countryCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, 'Enter a 2-letter ISO country code.'))

/** Blank means "no website on file"; anything else must be a URL. Mirrors `@/lib/validation/asset`'s `optionalDataRoomUrl`. */
const optionalWebsiteUrl = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, z.url().optional())

export const MAX_BIO_LENGTH = 1000
export const MAX_MANDATE_NOTES = 1000
export const MIN_TIMELINE_MONTHS = 1
export const MAX_TIMELINE_MONTHS = 60
/** Defensive ceiling on the countries array — there is no fixed jurisdiction enum (any ISO code is legal), so this bounds payload size the way `MAX_INCLUDED_ITEMS` bounds `assetInputSchema`'s `included`. */
export const MAX_MANDATE_COUNTRIES = 50

/**
 * The buyer-facing identity a seller sees once contacted or once deciding an
 * access request — distinct from the mandate below, which drives matching,
 * not identity.
 */
export const buyerProfileSchema = z.object({
  displayName: requiredText(200),
  buyerType: z.enum(BUYER_TYPES),
  country: countryCode,
  bio: z.string().trim().max(MAX_BIO_LENGTH),
  websiteUrl: optionalWebsiteUrl,
})

export type BuyerProfileInput = z.infer<typeof buyerProfileSchema>

/**
 * The six comparable facets of a mandate — exactly the fields
 * `MandateCriteria` (`@/lib/matching`) carries, and therefore exactly what
 * `scoreMatch` reads. Split out of `mandateSchema` below (which is those six
 * plus the buyer's own planning fields) so that `countMandateMatches`
 * (`@/server/actions/profile`) — a Server Action that scores a
 * *client-supplied* mandate without saving it — validates against the same
 * rules a saved mandate is held to, instead of trusting a raw
 * `MandateCriteria` off the wire. Before it did, a `categories` that was not
 * an array reached `scoreMatch` and threw, which Next.js surfaces as a 500.
 *
 * `categories`/`businessStatuses` are the real Prisma enums; `licenceTypes`
 * validates against the fixed, non-enum universe `MANDATE_LICENCE_TYPES`
 * documents; `countries` is regex-checked, not membership-checked, since any
 * ISO code is a legal jurisdiction. Every array may legitimately be empty —
 * that is "any", not "unset" — so none of them carries a `.min(1)`.
 *
 * `ticketMinCents`/`ticketMaxCents` are cents (integers), nullable
 * independently of each other, with the cross-field refinement ruling 1
 * (Task 16) asks for: when both are present, the minimum must not exceed the
 * maximum. The refinement's issue is attached to `ticketMaxCents` — the field
 * whose value is invalid *relative to* the other, mirroring which field the
 * form should flag inline.
 *
 * The shape and the refinement are shared with `mandateSchema` as values
 * rather than re-typed, because two schemas that are meant to agree on six
 * fields and differ on two must not be able to drift on the six.
 */
const mandateCriteriaShape = {
  categories: z.array(z.enum(ASSET_CATEGORIES)).max(ASSET_CATEGORIES.length),
  countries: z.array(countryCode).max(MAX_MANDATE_COUNTRIES),
  licenceTypes: z.array(z.enum(MANDATE_LICENCE_TYPES)).max(MANDATE_LICENCE_TYPES.length),
  businessStatuses: z.array(z.enum(BUSINESS_STATUSES)).max(BUSINESS_STATUSES.length),
  ticketMinCents: z.number().int().nonnegative().nullable(),
  ticketMaxCents: z.number().int().nonnegative().nullable(),
}

const ticketBoundsOrdered = (data: {
  ticketMinCents: number | null
  ticketMaxCents: number | null
}) =>
  data.ticketMinCents === null ||
  data.ticketMaxCents === null ||
  data.ticketMinCents <= data.ticketMaxCents

/** A fresh object per call: zod stores the `path` array it is handed. */
const ticketBoundsIssue = () => ({
  message: 'The maximum ticket must be at least the minimum.',
  path: ['ticketMaxCents'],
})

export const mandateCriteriaSchema = z
  .object(mandateCriteriaShape)
  .refine(ticketBoundsOrdered, ticketBoundsIssue())

export const mandateSchema = z
  .object({
    ...mandateCriteriaShape,
    timelineMonths: z.number().int().min(MIN_TIMELINE_MONTHS).max(MAX_TIMELINE_MONTHS).nullable(),
    notes: z.string().trim().max(MAX_MANDATE_NOTES),
  })
  .refine(ticketBoundsOrdered, ticketBoundsIssue())

export type MandateInput = z.infer<typeof mandateSchema>
