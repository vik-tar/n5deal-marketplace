import { describe, expect, it } from 'vitest'
import { assetFiltersToSearchParams, parseAssetFilters } from '@/lib/filters/asset-filters'

describe('parseAssetFilters', () => {
  it('returns defaults for empty input', () => {
    expect(parseAssetFilters({})).toEqual({
      q: '',
      categories: [],
      countries: [],
      businessStatuses: [],
      priceMinCents: null,
      priceMaxCents: null,
      sort: 'newest',
      page: 1,
    })
  })

  it('parses a comma-separated category list', () => {
    expect(parseAssetFilters({ categories: 'EMI,PAYMENT' }).categories).toEqual([
      'EMI',
      'PAYMENT',
    ])
  })

  it('parses a repeated query parameter', () => {
    expect(parseAssetFilters({ categories: ['EMI', 'BANK'] }).categories).toEqual([
      'EMI',
      'BANK',
    ])
  })

  it('drops unknown enum members but keeps valid ones', () => {
    expect(parseAssetFilters({ categories: 'EMI,WOMBAT' }).categories).toEqual(['EMI'])
  })

  it('uppercases country codes and drops malformed ones', () => {
    expect(parseAssetFilters({ countries: 'mt,GBR,gb' }).countries).toEqual(['MT', 'GB'])
  })

  it('deduplicates repeated values', () => {
    expect(parseAssetFilters({ countries: 'MT,MT' }).countries).toEqual(['MT'])
  })

  it('swaps an inverted price range', () => {
    const f = parseAssetFilters({ priceMin: '900000', priceMax: '100000' })
    expect(f.priceMinCents).toBe(100_000_00)
    expect(f.priceMaxCents).toBe(900_000_00)
  })

  it('reads prices as euros and stores cents', () => {
    expect(parseAssetFilters({ priceMin: '250000' }).priceMinCents).toBe(250_000_00)
  })

  it('falls back to the default sort for an unknown sort key', () => {
    expect(parseAssetFilters({ sort: 'DROP TABLE assets' }).sort).toBe('newest')
  })

  it('clamps a nonsensical page number', () => {
    expect(parseAssetFilters({ page: '-5' }).page).toBe(1)
    expect(parseAssetFilters({ page: 'abc' }).page).toBe(1)
  })

  it('truncates an overlong search string instead of rejecting it', () => {
    expect(parseAssetFilters({ q: 'x'.repeat(500) }).q).toHaveLength(200)
  })

  it('rejects page numbers beyond MAX_PAGE', () => {
    expect(parseAssetFilters({ page: '100000000000000000000' }).page).toBe(1)
  })

  it('rejects price bounds beyond MAX_FILTER_CENTS', () => {
    expect(parseAssetFilters({ priceMax: '1e21' }).priceMaxCents).toBe(null)
  })
})

describe('assetFiltersToSearchParams', () => {
  it('omits defaults so shared URLs stay short', () => {
    expect(assetFiltersToSearchParams({ sort: 'newest', page: 1 }).toString()).toBe('')
  })

  it('serialises arrays as comma lists', () => {
    const sp = assetFiltersToSearchParams({ categories: ['EMI', 'BANK'] })
    expect(sp.get('categories')).toBe('EMI,BANK')
  })

  it('round-trips through parse without drift', () => {
    const original = parseAssetFilters({
      categories: 'EMI',
      countries: 'MT',
      priceMin: '100000',
      sort: 'price_asc',
      page: '3',
    })
    const reparsed = parseAssetFilters(
      Object.fromEntries(assetFiltersToSearchParams(original)),
    )
    expect(reparsed).toEqual(original)
  })
})
