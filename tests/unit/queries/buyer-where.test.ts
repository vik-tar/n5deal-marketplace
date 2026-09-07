import { describe, expect, it } from 'vitest'
import {
  BUYER_ACCESS_STATUS_ORDER,
  buildBuyerWhere,
  compareBuyersByRecency,
  compareBuyersByScore,
  type BuyerRecencyKey,
  type BuyerScoreKey,
} from '@/server/queries/buyer-where'
import { groupByOrder } from '@/lib/group'
import { parseBuyerFilters, type BuyerFilters } from '@/lib/filters/buyer-filters'

/** `parseBuyerFilters({})` gives the exact default shape; overrides layer on top. */
function makeFilters(overrides: Partial<BuyerFilters> = {}): BuyerFilters {
  return { ...parseBuyerFilters({}), ...overrides }
}

/**
 * The floor `buildBuyerWhere` must always produce — asserted as a value, not
 * inferred from behaviour, mirroring `tests/unit/queries/asset-where.test.ts`'s
 * own `FLOOR` constant for `buildWhere`.
 */
const FLOOR = {
  user: { status: 'ACTIVE' },
} as const

describe('buildBuyerWhere', () => {
  it('includes the visibility floor with empty filters', () => {
    const where = buildBuyerWhere(makeFilters())
    expect(where.user).toEqual(FLOOR.user)
  })

  it('includes the visibility floor with every filter set', () => {
    const where = buildBuyerWhere(
      makeFilters({
        buyerTypes: ['PE_FUND'],
        categories: ['EMI', 'BANK'],
        countries: ['MT', 'GB'],
        ticketMinCents: 10_000_00,
        q: 'growth',
      }),
    )
    expect(where.user).toEqual(FLOOR.user)
  })

  it('adds the buyerType condition only when buyerTypes are set', () => {
    expect(buildBuyerWhere(makeFilters()).buyerType).toBeUndefined()
    expect(buildBuyerWhere(makeFilters({ buyerTypes: ['STRATEGIC', 'PE_FUND'] })).buyerType).toEqual({
      in: ['STRATEGIC', 'PE_FUND'],
    })
  })

  it('maps categories onto the mandate with hasSome, not onto the buyer itself', () => {
    expect(buildBuyerWhere(makeFilters()).mandate).toBeUndefined()
    const where = buildBuyerWhere(makeFilters({ categories: ['EMI', 'CRYPTO'] }))
    expect(where.mandate).toEqual({ categories: { hasSome: ['EMI', 'CRYPTO'] } })
  })

  it('maps countries onto the mandate with hasSome, not onto the buyer\'s own country', () => {
    const where = buildBuyerWhere(makeFilters({ countries: ['MT'] }))
    expect(where.mandate).toEqual({ countries: { hasSome: ['MT'] } })
    // The buyer's own `country` field is never filtered on — only the mandate's.
    expect(where.country).toBeUndefined()
  })

  it('selects buyers who can afford the ticket: no ceiling, or a ceiling at or above it', () => {
    const where = buildBuyerWhere(makeFilters({ ticketMinCents: 500_000_00 })).mandate as {
      OR?: unknown
    }
    expect(where.OR).toEqual([
      { ticketMaxCents: null },
      { ticketMaxCents: { gte: BigInt(500_000_00) } },
    ])
  })

  it('combines multiple mandate-shaped filters into one mandate condition', () => {
    const where = buildBuyerWhere(
      makeFilters({ categories: ['BANK'], countries: ['MT'], ticketMinCents: 100_00 }),
    ).mandate as { categories?: unknown; countries?: unknown; OR?: unknown }
    expect(where.categories).toEqual({ hasSome: ['BANK'] })
    expect(where.countries).toEqual({ hasSome: ['MT'] })
    expect(where.OR).toEqual([{ ticketMaxCents: null }, { ticketMaxCents: { gte: BigInt(100_00) } }])
  })

  it('adds the free-text OR condition only when q is set, searching name and bio', () => {
    expect(buildBuyerWhere(makeFilters()).OR).toBeUndefined()
    expect(buildBuyerWhere(makeFilters({ q: 'growth' })).OR).toEqual([
      { displayName: { contains: 'growth', mode: 'insensitive' } },
      { bio: { contains: 'growth', mode: 'insensitive' } },
    ])
  })

  it('does not let a free-text search collide with the ticket-affordability OR, which lives under mandate', () => {
    const where = buildBuyerWhere(makeFilters({ q: 'growth', ticketMinCents: 100_00 }))
    expect(where.OR).toEqual([
      { displayName: { contains: 'growth', mode: 'insensitive' } },
      { bio: { contains: 'growth', mode: 'insensitive' } },
    ])
    expect((where.mandate as { OR?: unknown }).OR).toEqual([
      { ticketMaxCents: null },
      { ticketMaxCents: { gte: BigInt(100_00) } },
    ])
  })
})

function recencyKey(id: string, createdAt: string): BuyerRecencyKey {
  return { id, createdAt: new Date(createdAt) }
}

function scoreKey(id: string, createdAt: string, score: number, specificity: number): BuyerScoreKey {
  return { id, createdAt: new Date(createdAt), score, specificity }
}

describe('compareBuyersByRecency', () => {
  it('sorts newest first', () => {
    const a = recencyKey('b-1', '2026-01-01T00:00:00Z')
    const b = recencyKey('b-2', '2026-01-02T00:00:00Z')
    expect([a, b].sort(compareBuyersByRecency)).toEqual([b, a])
  })

  it('breaks a createdAt tie by id ascending, so no two distinct rows ever compare equal', () => {
    const a = recencyKey('b-2', '2026-01-01T00:00:00Z')
    const b = recencyKey('b-1', '2026-01-01T00:00:00Z')
    // `a` sorts after `b` despite being listed first, because 'b-2' > 'b-1'.
    expect([a, b].sort(compareBuyersByRecency)).toEqual([b, a])
    expect(compareBuyersByRecency(a, b)).toBeGreaterThan(0)
    expect(compareBuyersByRecency(b, a)).toBeLessThan(0)
  })

  it('is reflexive: a row never compares unequal to itself', () => {
    const a = recencyKey('b-1', '2026-01-01T00:00:00Z')
    expect(compareBuyersByRecency(a, a)).toBe(0)
  })
})

describe('compareBuyersByScore', () => {
  it('sorts by score descending first', () => {
    const low = scoreKey('b-1', '2026-01-01T00:00:00Z', 40, 5)
    const high = scoreKey('b-2', '2026-01-01T00:00:00Z', 90, 0)
    expect([low, high].sort(compareBuyersByScore)).toEqual([high, low])
  })

  it('breaks a score tie by specificity descending, which is the whole point', () => {
    // Same score, same createdAt: the buyer whose mandate constrains more
    // criteria (a genuinely better lead) must rank first, never the other
    // way around and never left to whatever order the input happened to be in.
    const unconstrained = scoreKey('b-broad', '2026-01-01T00:00:00Z', 100, 0)
    const constrained = scoreKey('b-narrow', '2026-01-01T00:00:00Z', 100, 5)
    expect([unconstrained, constrained].sort(compareBuyersByScore)).toEqual([
      constrained,
      unconstrained,
    ])
    expect([constrained, unconstrained].sort(compareBuyersByScore)).toEqual([
      constrained,
      unconstrained,
    ])
  })

  it('falls through to createdAt descending, then id ascending, when score and specificity both tie', () => {
    const older = scoreKey('b-2', '2026-01-01T00:00:00Z', 70, 3)
    const newer = scoreKey('b-1', '2026-01-02T00:00:00Z', 70, 3)
    expect([older, newer].sort(compareBuyersByScore)).toEqual([newer, older])

    const sameInstant1 = scoreKey('b-2', '2026-01-01T00:00:00Z', 70, 3)
    const sameInstant2 = scoreKey('b-1', '2026-01-01T00:00:00Z', 70, 3)
    expect([sameInstant1, sameInstant2].sort(compareBuyersByScore)).toEqual([
      sameInstant2,
      sameInstant1,
    ])
  })

  it('never returns 0 for two distinct ids, however many keys tie — a total order', () => {
    const a = scoreKey('b-2', '2026-01-01T00:00:00Z', 70, 3)
    const b = scoreKey('b-1', '2026-01-01T00:00:00Z', 70, 3)
    expect(compareBuyersByScore(a, b)).not.toBe(0)
  })
})

describe('BUYER_ACCESS_STATUS_ORDER', () => {
  it('leads with the only group the buyer can act on', () => {
    expect(BUYER_ACCESS_STATUS_ORDER[0]).toBe('APPROVED')
  })

  it('closes with the two terminal statuses, decline before revocation', () => {
    expect(BUYER_ACCESS_STATUS_ORDER.slice(2)).toEqual(['DECLINED', 'REVOKED'])
  })

  it('covers every AccessStatus exactly once', () => {
    const every = ['REQUESTED', 'APPROVED', 'DECLINED', 'REVOKED']
    expect([...BUYER_ACCESS_STATUS_ORDER].sort()).toEqual([...every].sort())
  })

  /** The composition the buyer dashboard renders, asserted end to end. */
  it('groups a buyer\'s requests approved-first regardless of the order they arrived in', () => {
    const requests = [
      { id: '1', status: 'REVOKED' as const },
      { id: '2', status: 'REQUESTED' as const },
      { id: '3', status: 'APPROVED' as const },
    ]
    const groups = groupByOrder(requests, (request) => request.status, BUYER_ACCESS_STATUS_ORDER)
    expect(groups.map((group) => group.key)).toEqual(['APPROVED', 'REQUESTED', 'REVOKED'])
  })
})
