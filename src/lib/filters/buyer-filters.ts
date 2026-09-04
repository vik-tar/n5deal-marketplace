import type { AssetCategory, BuyerType } from '@/generated/prisma/client'
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

export const MANDATE_CATEGORIES = [
  'BANK',
  'FINTECH',
  'PAYMENT',
  'EMI',
  'CRYPTO',
] as const satisfies readonly AssetCategory[]

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
    categories: keepKnown(toList(sp.categories), MANDATE_CATEGORIES),
    countries: toCountryCodes(sp.countries),
    ticketMinCents: toCents(sp.ticketMin),
    page: toPositiveInt(sp.page, 1),
  }
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
