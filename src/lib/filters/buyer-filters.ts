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

/**
 * `Mandate.licenceTypes` and `Asset.licenceType` are both plain strings in
 * `prisma/schema.prisma`, not a Prisma enum — but they are not arbitrary free
 * text either: `prisma/seed-data/assets.ts` documents "the fixed licence-type
 * universe" every seeded listing draws from (`CATEGORY_INFO[*].licenceOptions`),
 * and `scoreMatch` (`@/lib/matching`) matches a mandate's `licenceTypes`
 * against a listing's `licenceType` by exact string equality — so a mandate
 * chip for a licence type that no listing could ever carry would silently
 * never match anything. This is that same fixed universe, named once here so
 * `mandateSchema` (`@/lib/validation/profile`, Task 16) and the mandate form's
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

export type MandateLicenceType = (typeof MANDATE_LICENCE_TYPES)[number]

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
