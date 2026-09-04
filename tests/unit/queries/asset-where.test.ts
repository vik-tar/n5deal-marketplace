import { describe, expect, it } from 'vitest'
import { buildWhere } from '@/server/queries/assets'
import { parseAssetFilters, type AssetFilters } from '@/lib/filters/asset-filters'

/** `parseAssetFilters({})` gives the exact default shape; overrides layer on top. */
function makeFilters(overrides: Partial<AssetFilters> = {}): AssetFilters {
  return { ...parseAssetFilters({}), ...overrides }
}

/**
 * The floor `buildWhere` must always produce — asserted as a value, not
 * inferred from behaviour, so a future edit that touches this object is
 * checked against the literal shape Task 20's moderation cascade depends on.
 */
const FLOOR = {
  status: 'PUBLISHED',
  sellerProfile: { user: { status: 'ACTIVE' } },
} as const

describe('buildWhere', () => {
  it('includes the visibility floor with empty filters', () => {
    const where = buildWhere(makeFilters(), false)
    expect(where.status).toBe(FLOOR.status)
    expect(where.sellerProfile).toEqual(FLOOR.sellerProfile)
  })

  it('includes the visibility floor with every filter set', () => {
    const where = buildWhere(
      makeFilters({
        categories: ['EMI', 'BANK'],
        countries: ['MT', 'GB'],
        businessStatuses: ['LICENSE_ONLY'],
        priceMinCents: 10_000_00,
        priceMaxCents: 900_000_00,
        q: 'safeguard',
      }),
      false,
    )
    expect(where.status).toBe(FLOOR.status)
    expect(where.sellerProfile).toEqual(FLOOR.sellerProfile)
  })

  it('includes the visibility floor on the facet path, which omits the category filter', () => {
    const where = buildWhere(makeFilters({ categories: ['EMI'] }), true)
    expect(where.status).toBe(FLOOR.status)
    expect(where.sellerProfile).toEqual(FLOOR.sellerProfile)
    expect(where.category).toBeUndefined()
  })

  it('does not let a businessStatuses filter of ACTIVE disturb the status floor', () => {
    // `businessStatuses: ['ACTIVE']` and the floor's `sellerProfile.user.status:
    // 'ACTIVE'` share a value on two different keys — this is exactly the kind
    // of same-looking-key collision a spread-order regression could introduce.
    const where = buildWhere(makeFilters({ businessStatuses: ['ACTIVE'] }), false)
    expect(where.status).toBe(FLOOR.status)
    expect(where.sellerProfile).toEqual(FLOOR.sellerProfile)
    expect(where.businessStatus).toEqual({ in: ['ACTIVE'] })
  })

  it('adds the category condition only when categories are set', () => {
    expect(buildWhere(makeFilters(), false).category).toBeUndefined()
    expect(buildWhere(makeFilters({ categories: ['EMI', 'CRYPTO'] }), false).category).toEqual({
      in: ['EMI', 'CRYPTO'],
    })
  })

  it('adds the country condition only when countries are set', () => {
    expect(buildWhere(makeFilters(), false).country).toBeUndefined()
    expect(buildWhere(makeFilters({ countries: ['MT'] }), false).country).toEqual({
      in: ['MT'],
    })
  })

  it('adds the business status condition only when business statuses are set', () => {
    expect(buildWhere(makeFilters(), false).businessStatus).toBeUndefined()
    expect(
      buildWhere(makeFilters({ businessStatuses: ['LICENSE_ONLY'] }), false).businessStatus,
    ).toEqual({ in: ['LICENSE_ONLY'] })
  })

  it('adds the price condition only when a bound is set, and never leaves it as a number', () => {
    expect(buildWhere(makeFilters(), false).askingPriceCents).toBeUndefined()

    const bothBounds = buildWhere(
      makeFilters({ priceMinCents: 10_000_00, priceMaxCents: 900_000_00 }),
      false,
    ).askingPriceCents as { gte?: unknown; lte?: unknown }
    expect(typeof bothBounds.gte).toBe('bigint')
    expect(bothBounds.gte).toBe(BigInt(10_000_00))
    expect(typeof bothBounds.lte).toBe('bigint')
    expect(bothBounds.lte).toBe(BigInt(900_000_00))

    const minOnly = buildWhere(makeFilters({ priceMinCents: 5_000_00 }), false)
      .askingPriceCents as { gte?: unknown; lte?: unknown }
    expect(typeof minOnly.gte).toBe('bigint')
    expect(minOnly.lte).toBeUndefined()

    const maxOnly = buildWhere(makeFilters({ priceMaxCents: 5_000_00 }), false)
      .askingPriceCents as { gte?: unknown; lte?: unknown }
    expect(typeof maxOnly.lte).toBe('bigint')
    expect(maxOnly.gte).toBeUndefined()
  })

  it('adds the free-text OR condition only when q is set', () => {
    expect(buildWhere(makeFilters(), false).OR).toBeUndefined()
    expect(buildWhere(makeFilters({ q: 'safeguard' }), false).OR).toEqual([
      { teaserTitle: { contains: 'safeguard', mode: 'insensitive' } },
      { teaserDescription: { contains: 'safeguard', mode: 'insensitive' } },
      { publicRef: { contains: 'safeguard', mode: 'insensitive' } },
      { businessType: { contains: 'safeguard', mode: 'insensitive' } },
    ])
  })
})
