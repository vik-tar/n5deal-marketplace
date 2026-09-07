import type { AssetCategory, BusinessStatus } from '@/generated/prisma/client'
import {
  keepKnown,
  toCents,
  toCountryCodes,
  toList,
  toPositiveInt,
  type RawSearchParams,
} from './shared'

export const ASSET_CATEGORIES = [
  'BANK',
  'FINTECH',
  'PAYMENT',
  'EMI',
  'CRYPTO',
] as const satisfies readonly AssetCategory[]

export const BUSINESS_STATUSES = [
  'ACTIVE',
  'LICENSE_ONLY',
] as const satisfies readonly BusinessStatus[]

export const ASSET_SORTS = ['newest', 'popular', 'price_asc', 'price_desc'] as const
export type AssetSort = (typeof ASSET_SORTS)[number]

export interface AssetFilters {
  q: string
  categories: AssetCategory[]
  countries: string[]
  businessStatuses: BusinessStatus[]
  priceMinCents: number | null
  priceMaxCents: number | null
  sort: AssetSort
  page: number
}

const DEFAULTS: AssetFilters = {
  q: '',
  categories: [],
  countries: [],
  businessStatuses: [],
  priceMinCents: null,
  priceMaxCents: null,
  sort: 'newest',
  page: 1,
}

export function parseAssetFilters(sp: RawSearchParams): AssetFilters {
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort

  let priceMinCents = toCents(sp.priceMin)
  let priceMaxCents = toCents(sp.priceMax)
  if (priceMinCents !== null && priceMaxCents !== null && priceMinCents > priceMaxCents) {
    ;[priceMinCents, priceMaxCents] = [priceMaxCents, priceMinCents]
  }

  return {
    q: (rawQ ?? '').trim().slice(0, 200),
    categories: keepKnown(toList(sp.categories), ASSET_CATEGORIES),
    countries: toCountryCodes(sp.countries),
    businessStatuses: keepKnown(toList(sp.businessStatuses), BUSINESS_STATUSES),
    priceMinCents,
    priceMaxCents,
    sort: (ASSET_SORTS as readonly string[]).includes(sortRaw ?? '')
      ? (sortRaw as AssetSort)
      : DEFAULTS.sort,
    page: toPositiveInt(sp.page, 1),
  }
}

export function assetFiltersToSearchParams(
  filters: Partial<AssetFilters>,
): URLSearchParams {
  const sp = new URLSearchParams()
  if (filters.q) sp.set('q', filters.q)
  if (filters.categories?.length) sp.set('categories', filters.categories.join(','))
  if (filters.countries?.length) sp.set('countries', filters.countries.join(','))
  if (filters.businessStatuses?.length)
    sp.set('businessStatuses', filters.businessStatuses.join(','))
  if (filters.priceMinCents != null) sp.set('priceMin', String(filters.priceMinCents / 100))
  if (filters.priceMaxCents != null) sp.set('priceMax', String(filters.priceMaxCents / 100))
  if (filters.sort && filters.sort !== DEFAULTS.sort) sp.set('sort', filters.sort)
  if (filters.page && filters.page !== 1) sp.set('page', String(filters.page))
  return sp
}

/**
 * One category and how many listings are in it.
 *
 * Declared here rather than beside the query that produces it because this
 * module already owns `ASSET_CATEGORIES` — the universe of categories and the
 * order the product presents them in — and, more practically, because
 * `@/server/queries/assets` builds a Prisma client at import time and so
 * cannot be imported by a unit test. `CategoryFacet` there is an alias of this
 * type, not a second declaration of the same shape.
 */
export interface CategoryCount {
  category: AssetCategory
  count: number
}

/**
 * The five categories in `ASSET_CATEGORIES` order, each with its count, and
 * zero for any the caller had no row for.
 *
 * Both halves are rules, and both are invisible in today's seeded data —
 * which has at least one published listing in every category, in an order that
 * happens to differ from the one that comes back:
 *
 * - **Zero-filling.** Prisma's `groupBy` emits a row only for groups that
 *   exist, so a category whose last published listing is sold, suspended, or
 *   loses its seller drops out of the facets entirely. A category tile that
 *   disappears reads as "this category was removed", not "nothing for sale in
 *   it right now".
 * - **Ordering.** `listAssets` (`@/server/queries/assets`) orders its facets
 *   by `category` ascending, which is alphabetical over the enum's *values*
 *   (BANK, CRYPTO, EMI, FINTECH, PAYMENT) and not `ASSET_CATEGORIES`
 *   (BANK, FINTECH, PAYMENT, EMI, CRYPTO). The catalog sidebar has always
 *   rendered the latter, so anything else showing the same five categories
 *   must use it too, or the same five things appear in two different orders
 *   one click apart.
 *
 * A category in `facets` that is not in the allowlist is dropped rather than
 * appended: the allowlist is the whole `AssetCategory` universe by
 * construction (`satisfies readonly AssetCategory[]`), so a value outside it
 * could only come from a row this app has no translated name for anyway.
 */
export function categoryCountsInOrder(
  facets: readonly CategoryCount[],
): CategoryCount[] {
  const byCategory = new Map(facets.map((facet) => [facet.category, facet.count]))
  return ASSET_CATEGORIES.map((category) => ({
    category,
    count: byCategory.get(category) ?? 0,
  }))
}
