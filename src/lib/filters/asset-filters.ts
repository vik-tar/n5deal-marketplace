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
