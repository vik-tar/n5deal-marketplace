import { describe, expect, it } from 'vitest'
import {
  ASSET_CATEGORIES,
  assetFiltersToSearchParams,
  categoryCountsInOrder,
  parseAssetFilters,
} from '@/lib/filters/asset-filters'

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

describe('categoryCountsInOrder', () => {
  it('returns every category, in ASSET_CATEGORIES order, whatever order it was given', () => {
    // Alphabetical over the enum's values — the order `listAssets` actually
    // returns its facets in (`orderBy: { category: 'asc' }`), which is *not*
    // the order the product shows categories in.
    const alphabetical = [
      { category: 'BANK', count: 4 },
      { category: 'CRYPTO', count: 4 },
      { category: 'EMI', count: 4 },
      { category: 'FINTECH', count: 5 },
      { category: 'PAYMENT', count: 17 },
    ] as const

    expect(categoryCountsInOrder(alphabetical).map((c) => c.category)).toEqual([
      ...ASSET_CATEGORIES,
    ])
  })

  it('zero-fills a category the facet query returned no group for', () => {
    // Prisma's `groupBy` omits empty groups, so the last CRYPTO listing being
    // sold makes that category vanish from `facets` entirely. The tile must
    // read 0, not disappear.
    const counts = categoryCountsInOrder([{ category: 'BANK', count: 4 }])

    expect(counts).toHaveLength(ASSET_CATEGORIES.length)
    expect(counts.find((c) => c.category === 'CRYPTO')).toEqual({
      category: 'CRYPTO',
      count: 0,
    })
  })

  it('returns all five zeros for an empty catalog', () => {
    expect(categoryCountsInOrder([])).toEqual(
      ASSET_CATEGORIES.map((category) => ({ category, count: 0 })),
    )
  })

  it('preserves the counts it was given', () => {
    const counts = categoryCountsInOrder([
      { category: 'PAYMENT', count: 17 },
      { category: 'FINTECH', count: 5 },
    ])

    expect(counts.find((c) => c.category === 'PAYMENT')?.count).toBe(17)
    expect(counts.find((c) => c.category === 'FINTECH')?.count).toBe(5)
  })
})
