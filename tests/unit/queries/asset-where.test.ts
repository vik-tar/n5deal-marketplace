import { describe, expect, it } from 'vitest'
import {
  buildWhere,
  compareRecommendedAssets,
  compareRequestQueues,
  mostRecentlyPublishedId,
  SELLER_STATUS_ORDER,
  type AssetRecommendationKey,
  type PublishedRecencyKey,
  type RequestQueueKey,
} from '@/server/queries/asset-where'
import { groupByOrder } from '@/lib/group'
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

/** Shorthand for the three keys `compareRecommendedAssets` reads. */
function rec(
  id: string,
  score: number,
  publishedAt: Date | null = new Date('2026-01-01T00:00:00Z'),
): AssetRecommendationKey {
  return { id, score, publishedAt }
}

describe('compareRecommendedAssets', () => {
  it('orders by score descending', () => {
    const ordered = [rec('a', 60), rec('b', 100), rec('c', 80)].sort(compareRecommendedAssets)
    expect(ordered.map((entry) => entry.id)).toEqual(['b', 'c', 'a'])
  })

  it('breaks a score tie on publishedAt descending', () => {
    const ordered = [
      rec('old', 80, new Date('2025-01-01T00:00:00Z')),
      rec('new', 80, new Date('2026-06-01T00:00:00Z')),
    ].sort(compareRecommendedAssets)
    expect(ordered.map((entry) => entry.id)).toEqual(['new', 'old'])
  })

  it('sorts a null publishedAt last among equal scores', () => {
    const ordered = [
      rec('unknown', 80, null),
      rec('dated', 80, new Date('2020-01-01T00:00:00Z')),
    ].sort(compareRecommendedAssets)
    expect(ordered.map((entry) => entry.id)).toEqual(['dated', 'unknown'])
  })

  /**
   * The total-order proof: two listings equal on score and publishedAt must
   * still have a defined relative order, or the top-`limit` slice could
   * differ between two renders of the same data.
   */
  it('is a total order — no two distinct listings compare equal', () => {
    const at = new Date('2026-01-01T00:00:00Z')
    expect(compareRecommendedAssets(rec('a', 80, at), rec('b', 80, at))).toBeLessThan(0)
    expect(compareRecommendedAssets(rec('b', 80, at), rec('a', 80, at))).toBeGreaterThan(0)
    expect(compareRecommendedAssets(rec('a', 80, at), rec('a', 80, at))).toBe(0)
  })
})

describe('SELLER_STATUS_ORDER', () => {
  it('surfaces the two statuses needing attention before everything else', () => {
    expect(SELLER_STATUS_ORDER.slice(0, 2)).toEqual(['REJECTED', 'PENDING_REVIEW'])
  })

  it('covers every AssetStatus exactly once', () => {
    const every = ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'SOLD']
    expect([...SELLER_STATUS_ORDER].sort()).toEqual([...every].sort())
  })

  /**
   * The order constant and the grouping function are separately correct only
   * if they agree, so this asserts the composition the seller dashboard
   * actually renders.
   */
  it('puts a rejected listing above a published one when grouped', () => {
    const listings = [
      { id: '1', status: 'PUBLISHED' as const },
      { id: '2', status: 'SOLD' as const },
      { id: '3', status: 'REJECTED' as const },
      { id: '4', status: 'PENDING_REVIEW' as const },
    ]
    const groups = groupByOrder(listings, (listing) => listing.status, SELLER_STATUS_ORDER)
    expect(groups.map((group) => group.key)).toEqual([
      'REJECTED',
      'PENDING_REVIEW',
      'PUBLISHED',
      'SOLD',
    ])
  })
})

describe('mostRecentlyPublishedId', () => {
  const assets: PublishedRecencyKey[] = [
    { id: 'draft', status: 'DRAFT', publishedAt: null },
    { id: 'older', status: 'PUBLISHED', publishedAt: new Date('2025-01-01T00:00:00Z') },
    { id: 'newest', status: 'PUBLISHED', publishedAt: new Date('2026-05-01T00:00:00Z') },
    { id: 'sold', status: 'SOLD', publishedAt: new Date('2026-09-01T00:00:00Z') },
  ]

  it('picks the newest PUBLISHED listing', () => {
    expect(mostRecentlyPublishedId(assets)).toBe('newest')
  })

  /**
   * A `SOLD` listing keeps its `publishedAt` and would win a naive max, but
   * its matched buyers are people to stop contacting — the status filter is
   * what this asserts, not the date arithmetic.
   */
  it('ignores a more recently published listing that is no longer PUBLISHED', () => {
    expect(mostRecentlyPublishedId(assets)).not.toBe('sold')
  })

  it('returns null when the seller has published nothing', () => {
    expect(
      mostRecentlyPublishedId([{ id: 'draft', status: 'DRAFT', publishedAt: null }]),
    ).toBeNull()
  })

  it('never lets a null publishedAt beat a dated one, and breaks ties on id', () => {
    const at = new Date('2026-01-01T00:00:00Z')
    expect(
      mostRecentlyPublishedId([
        { id: 'undated', status: 'PUBLISHED', publishedAt: null },
        { id: 'dated', status: 'PUBLISHED', publishedAt: at },
      ]),
    ).toBe('dated')
    expect(
      mostRecentlyPublishedId([
        { id: 'b', status: 'PUBLISHED', publishedAt: at },
        { id: 'a', status: 'PUBLISHED', publishedAt: at },
      ]),
    ).toBe('a')
  })
})

describe('compareRequestQueues', () => {
  function queue(publicRef: string, oldestPendingAt: Date | null): RequestQueueKey {
    return { publicRef, oldestPendingAt }
  }

  it('puts the longest-waiting request first', () => {
    const ordered = [
      queue('N5-702', new Date('2026-03-01T00:00:00Z')),
      queue('N5-701', new Date('2026-01-01T00:00:00Z')),
    ].sort(compareRequestQueues)
    expect(ordered.map((entry) => entry.publicRef)).toEqual(['N5-701', 'N5-702'])
  })

  it('sorts queues with nothing left to decide after every queue that has something', () => {
    const ordered = [
      queue('N5-700', null),
      queue('N5-999', new Date('2026-06-01T00:00:00Z')),
    ].sort(compareRequestQueues)
    expect(ordered.map((entry) => entry.publicRef)).toEqual(['N5-999', 'N5-700'])
  })

  it('is a total order — publicRef breaks every remaining tie', () => {
    const at = new Date('2026-01-01T00:00:00Z')
    expect(compareRequestQueues(queue('N5-701', at), queue('N5-702', at))).toBeLessThan(0)
    expect(compareRequestQueues(queue('N5-702', null), queue('N5-701', null))).toBeGreaterThan(0)
    expect(compareRequestQueues(queue('N5-701', at), queue('N5-701', at))).toBe(0)
  })
})
