import { describe, expect, it } from 'vitest'
import { buildBuyerWhere } from '@/server/queries/buyer-where'
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
