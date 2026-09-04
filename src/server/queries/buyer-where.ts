import type { Prisma } from '@/generated/prisma/client'
import type { BuyerFilters } from '@/lib/filters/buyer-filters'

/**
 * Pure query-shape logic, deliberately kept out of `buyers.ts`, mirroring
 * `@/server/queries/asset-where`'s own doc comment: this module imports only
 * *types* from the generated Prisma client and never imports `@/server/db`,
 * so the visibility floor and filter shape stay testable as ordinary pure
 * logic with no database, no connection string, and no environment at all.
 */

/**
 * The floor every buyer-catalog query enforces (ruling 1, Task 17): only
 * buyers whose account is still active. Nothing in this module — or in any
 * caller — widens it; `listBuyers` (`@/server/queries/buyers`) applies this
 * unconditionally, before the authorization check that decides whether the
 * caller may see the directory at all.
 */
export const BUYER_VISIBILITY_FLOOR = {
  user: { status: 'ACTIVE' },
} as const satisfies Prisma.BuyerProfileWhereInput

/**
 * Ruling 2 (Task 17): every filter here maps onto the mandate, not the
 * buyer's own country or identity — `categories` and `countries` are
 * `hasSome` against the mandate's arrays, `buyerTypes` is `in` against the
 * buyer's own type, and `ticketMinCents` selects a buyer who could plausibly
 * afford this ticket: their mandate's `ticketMaxCents` is null (no ceiling)
 * or at least the amount asked. `q` searches the buyer's own display name
 * and bio, not the mandate — a free-text search is about who the buyer *is*,
 * not what they will pay.
 *
 * A buyer with no `Mandate` row at all (legitimately possible — Task 16's
 * ruling 2: a buyer who never saved one has none) fails every mandate-shaped
 * condition here exactly as a buyer whose mandate constrains that criterion
 * away from the query would; only the unfiltered case (nothing set on
 * `categories`/`countries`/`ticketMinCents`) leaves them visible, matching
 * `listBuyers`' own "no mandate" fallback to the vacuous "any preference"
 * criteria.
 *
 * Exported so `tests/unit/queries/buyer-where.test.ts` can assert the
 * visibility floor and the filter shape directly on the returned object,
 * exactly as `tests/unit/queries/asset-where.test.ts` does for `buildWhere`.
 */
export function buildBuyerWhere(filters: BuyerFilters): Prisma.BuyerProfileWhereInput {
  const where: Prisma.BuyerProfileWhereInput = { ...BUYER_VISIBILITY_FLOOR }

  if (filters.buyerTypes.length > 0) {
    where.buyerType = { in: filters.buyerTypes }
  }

  const mandateWhere: Prisma.MandateWhereInput = {}
  if (filters.categories.length > 0) {
    mandateWhere.categories = { hasSome: filters.categories }
  }
  if (filters.countries.length > 0) {
    mandateWhere.countries = { hasSome: filters.countries }
  }
  if (filters.ticketMinCents !== null) {
    mandateWhere.OR = [
      { ticketMaxCents: null },
      { ticketMaxCents: { gte: BigInt(filters.ticketMinCents) } },
    ]
  }
  if (Object.keys(mandateWhere).length > 0) {
    where.mandate = mandateWhere
  }

  if (filters.q !== '') {
    where.OR = [
      { displayName: { contains: filters.q, mode: 'insensitive' } },
      { bio: { contains: filters.q, mode: 'insensitive' } },
    ]
  }

  return where
}
