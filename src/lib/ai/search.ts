import { z } from 'zod'
import type { AssetFilters } from '@/lib/filters/asset-filters'
import { ASSET_CATEGORIES, BUSINESS_STATUSES } from '@/lib/filters/asset-filters'
import { callStructured } from './client'

const searchResultSchema = z.object({
  categories: z.array(z.enum(ASSET_CATEGORIES)),
  countries: z.array(z.string()),
  businessStatuses: z.array(z.enum(BUSINESS_STATUSES)),
  priceMinEur: z.number().nullable(),
  priceMaxEur: z.number().nullable(),
  freeText: z.string(),
})

export type SearchResult = z.infer<typeof searchResultSchema>

const SYSTEM = `You convert a marketplace search phrase into filters for a marketplace of licensed financial institutions.

Categories: BANK, FINTECH, PAYMENT, EMI, CRYPTO.
Business status: ACTIVE (a trading business) or LICENSE_ONLY (a licence with no operations).
Countries: ISO 3166-1 alpha-2 codes.
Prices: whole euros, null when the phrase says nothing about price.
freeText: anything that is not expressible as a filter, otherwise an empty string.

Extract only what the phrase actually says. Never guess a country or a price.`

/** Pure: the exact prompt sent for a query. */
export function buildSearchPrompt(query: string): string {
  return `Search phrase: ${query.trim().slice(0, 200)}`
}

/** Pure: converts a model result into a filter patch, dropping empty facets. */
export function toFilterPatch(result: SearchResult): Partial<AssetFilters> {
  const patch: Partial<AssetFilters> = {}

  if (result.categories.length > 0) patch.categories = result.categories
  const countries = result.countries
    .map((c) => c.toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c))
  if (countries.length > 0) patch.countries = countries
  if (result.businessStatuses.length > 0) patch.businessStatuses = result.businessStatuses
  if (result.priceMinEur !== null) patch.priceMinCents = Math.round(result.priceMinEur * 100)
  if (result.priceMaxEur !== null) patch.priceMaxCents = Math.round(result.priceMaxEur * 100)
  if (result.freeText.trim() !== '') patch.q = result.freeText.trim()

  return patch
}

export async function parseSearchQuery(
  query: string,
): Promise<Partial<AssetFilters> | null> {
  const result = await callStructured({
    system: SYSTEM,
    user: buildSearchPrompt(query),
    schema: searchResultSchema,
    maxTokens: 512,
  })
  return result === null ? null : toFilterPatch(result)
}
