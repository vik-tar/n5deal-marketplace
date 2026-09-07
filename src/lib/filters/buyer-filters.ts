import type { AssetCategory, BuyerType } from '@/generated/prisma/client'
import { ASSET_CATEGORIES } from './asset-filters'
import {
  keepKnown,
  toCents,
  toCountryCodes,
  toList,
  toPositiveInt,
  type RawSearchParams,
} from './shared'

export const BUYER_TYPES = [
  'PE_FUND',
  'STRATEGIC',
  'FAMILY_OFFICE',
  'INDIVIDUAL',
] as const satisfies readonly BuyerType[]

/**
 * `Mandate.licenceTypes` and `Asset.licenceType` are both plain strings in
 * `prisma/schema.prisma`, not a Prisma enum — but they are not arbitrary free
 * text either: `prisma/seed-data/assets.ts` documents "the fixed licence-type
 * universe" every seeded listing draws from (`CATEGORY_INFO[*].licenceOptions`),
 * and `scoreMatch` (`@/lib/matching`) matches a mandate's `licenceTypes`
 * against a listing's `licenceType` by exact string equality — so a mandate
 * chip for a licence type that no listing could ever carry would silently
 * never match anything. This is that same fixed universe, named once here so
 * `mandateSchema` (`@/lib/validation/profile`) and the mandate form's
 * chip picker share one definition of "known licence type" instead of each
 * guessing the list independently.
 */
export const MANDATE_LICENCE_TYPES = [
  'PI',
  'EMI',
  'SEMI',
  'MSO',
  'API',
  'CASP',
  'Banking',
] as const

export interface BuyerFilters {
  q: string
  buyerTypes: BuyerType[]
  categories: AssetCategory[]
  countries: string[]
  ticketMinCents: number | null
  page: number
}

export function parseBuyerFilters(sp: RawSearchParams): BuyerFilters {
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q

  return {
    q: (rawQ ?? '').trim().slice(0, 200),
    buyerTypes: keepKnown(toList(sp.buyerTypes), BUYER_TYPES),
    categories: keepKnown(toList(sp.categories), ASSET_CATEGORIES),
    countries: toCountryCodes(sp.countries),
    ticketMinCents: toCents(sp.ticketMin),
    page: toPositiveInt(sp.page, 1),
  }
}

/**
 * `forAsset` selects which listing the buyer catalog is scored against. It is
 * not part of `BuyerFilters` above because it is a scoring parameter, not a facet of the buyer search itself, exactly as
 * `AssetFilters`'s own `sort` is a distinct concern from its filter fields.
 * Parsed separately so a page can pass it to `listBuyers`/`getBuyerDetail`
 * without folding it into every filter round-trip.
 *
 * Returns `undefined` for anything but a single non-blank value, so a
 * hostile or malformed query string (a repeated `forAsset`, a blank one)
 * degrades to "not scoring" rather than being passed through as a truthy
 * nonsense string — the query functions still verify ownership independently,
 * but there is no reason to hand them garbage to check in the first place.
 */
export function parseForAssetId(sp: RawSearchParams): string | undefined {
  const raw = Array.isArray(sp.forAsset) ? sp.forAsset[0] : sp.forAsset
  const trimmed = raw?.trim() ?? ''
  return trimmed === '' ? undefined : trimmed
}

/**
 * The buyer-side twin of `hasActiveAssetFilters` (`@/lib/filters/asset-filters`),
 * kept here for the same reason and answering the same two questions:
 * `BuyerFilterSidebar`'s "clear filters" control and `/buyers`'s choice of
 * empty state. `page` is excluded; there is no `sort` on this side.
 */
export function hasActiveBuyerFilters(filters: BuyerFilters): boolean {
  return (
    filters.q !== '' ||
    filters.buyerTypes.length > 0 ||
    filters.categories.length > 0 ||
    filters.countries.length > 0 ||
    filters.ticketMinCents !== null
  )
}

export function buyerFiltersToSearchParams(
  filters: Partial<BuyerFilters>,
): URLSearchParams {
  const sp = new URLSearchParams()
  if (filters.q) sp.set('q', filters.q)
  if (filters.buyerTypes?.length) sp.set('buyerTypes', filters.buyerTypes.join(','))
  if (filters.categories?.length) sp.set('categories', filters.categories.join(','))
  if (filters.countries?.length) sp.set('countries', filters.countries.join(','))
  if (filters.ticketMinCents != null) sp.set('ticketMin', String(filters.ticketMinCents / 100))
  if (filters.page && filters.page !== 1) sp.set('page', String(filters.page))
  return sp
}
