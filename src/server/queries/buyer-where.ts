import type { AccessStatus, Prisma } from '@/generated/prisma/client'
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

/**
 * The unscored order `listBuyers` reads rows in — newest first, ties broken
 * by `id` ascending. Given to `findMany`'s own `orderBy` so the pre-sort read
 * itself is deterministic, exactly as `SORT_ORDER` (`@/server/queries/asset-where`)
 * appends `{ id: 'asc' }` to every one of its entries for the identical
 * reason: without a final, unique tie-break key, Postgres does not guarantee
 * a stable order for rows that compare equal on every earlier key, and a
 * paginated read over an unstably-ordered result can duplicate or drop rows
 * across pages.
 */
export const BUYER_SORT_ORDER = [
  { createdAt: 'desc' },
  { id: 'asc' },
] as const satisfies Prisma.BuyerProfileOrderByWithRelationInput[]

/** The minimum shape `compareBuyersByRecency` needs: a stable identity and a recency signal. */
export interface BuyerRecencyKey {
  id: string
  createdAt: Date
}

/** `BuyerRecencyKey` plus the two keys ruling 3 (Task 17) sorts a scored list by first. */
export interface BuyerScoreKey extends BuyerRecencyKey {
  score: number
  specificity: number
}

/**
 * Newest-first, ties broken by `id` ascending — the same tail `BUYER_SORT_ORDER`
 * gives `findMany`, reimplemented here as a plain comparator because
 * `listBuyers`'s unscored path sorts an already-fetched array in memory
 * rather than letting Postgres do it (ruling 3 does the identical thing for
 * the scored path below, since the score itself only exists after the rows
 * are fetched). Exported so `tests/unit/queries/buyer-where.test.ts` can
 * assert the tie-break without a database.
 */
export function compareBuyersByRecency(a: BuyerRecencyKey, b: BuyerRecencyKey): number {
  const byRecency = b.createdAt.getTime() - a.createdAt.getTime()
  if (byRecency !== 0) return byRecency
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Ruling 3 (Task 17): score descending, ties broken by `specificity`
 * descending — a buyer whose mandate constrains all five criteria and still
 * scores 100 is a genuinely better lead than one who scores 100 because
 * their mandate constrains nothing — then falls through to
 * `compareBuyersByRecency` for its own `createdAt` descending, `id`
 * ascending tail, so every key in the sort is a total order and no two
 * distinct buyers can compare equal.
 */
export function compareBuyersByScore(a: BuyerScoreKey, b: BuyerScoreKey): number {
  if (a.score !== b.score) return b.score - a.score
  if (a.specificity !== b.specificity) return b.specificity - a.specificity
  return compareBuyersByRecency(a, b)
}

/**
 * The order the buyer dashboard renders its access-request groups in
 * (Task 18), the buyer-side counterpart of `SELLER_STATUS_ORDER`
 * (`@/server/queries/asset-where`) — and ordered on the same principle, "what
 * can this person act on", which lands somewhere different on each side of
 * the market.
 *
 * `APPROVED` leads because it is the only group where the buyer has something
 * to *do*: the confidential pack is open and waiting to be read. `REQUESTED`
 * follows — the ask is in, the seller owes the answer, nothing to do but
 * watch. `DECLINED` and `REVOKED` are both terminal and final (the unique
 * constraint on `(assetId, buyerProfileId)` means a buyer gets one ask per
 * listing and cannot try again), so they close the list as history; `DECLINED`
 * before `REVOKED` because a decline is the answer to a request the buyer
 * made, while a revocation is a seller withdrawing something already given.
 *
 * Exhaustive over `AccessStatus` by construction, for the same reason
 * `SELLER_STATUS_ORDER` is over `AssetStatus`.
 */
export const BUYER_ACCESS_STATUS_ORDER = [
  'APPROVED',
  'REQUESTED',
  'DECLINED',
  'REVOKED',
] as const satisfies readonly AccessStatus[]
