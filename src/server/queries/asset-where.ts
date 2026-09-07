import type { AssetStatus, Prisma } from '@/generated/prisma/client'
import type { AssetFilters, AssetSort } from '@/lib/filters/asset-filters'

/**
 * Pure query-shape and ordering logic, deliberately kept out of `assets.ts`:
 * this module imports only *types* from the generated Prisma client
 * (`import type`, so nothing at runtime pulls the client in) and never
 * imports `@/server/db`. `@/server/db` constructs the Prisma client eagerly
 * at module load and fails fast without `DATABASE_URL` — fine for the query
 * module that actually talks to Postgres, but wrong for the module defending
 * the visibility floor, which should be testable as ordinary pure logic with
 * no database, no connection string, and no environment at all.
 *
 * The ranking and grouping rules below are here for the same reason
 * `buyer-where.ts` already holds `compareBuyersByRecency`/`compareBuyersByScore`
 * rather than burying them inside `listBuyers`: a sort comparator defined
 * inside a query function is a rule no test can reach.
 */

/**
 * The floor every catalog query enforces, independent of who is asking:
 * published listings from sellers whose account is still active. Nothing in
 * this module — or in any caller — can widen it; the moderation cascade
 * (suspending a seller) depends on exactly this being unconditional.
 * Managers and the listing's own seller do not get a wider view here either —
 * moderation and the seller's own dashboard are separate query paths, not a
 * `viewer`-gated branch of the public catalog.
 */
export const VISIBILITY_FLOOR = {
  status: 'PUBLISHED',
  sellerProfile: { user: { status: 'ACTIVE' } },
} as const satisfies Prisma.AssetWhereInput

export const SORT_ORDER: Record<AssetSort, Prisma.AssetOrderByWithRelationInput[]> = {
  newest: [{ publishedAt: 'desc' }, { id: 'asc' }],
  popular: [{ viewCount: 'desc' }, { id: 'asc' }],
  price_asc: [{ askingPriceCents: 'asc' }, { id: 'asc' }],
  price_desc: [{ askingPriceCents: 'desc' }, { id: 'asc' }],
}

/**
 * `omitCategory` builds the where clause the sidebar's own facet counts run
 * against: every filter except the category selection itself, so a checkbox
 * for a category the user has *not* yet selected still shows how many
 * listings it would add, instead of freezing at whatever was true before the
 * first category was picked.
 *
 * Exported so `tests/unit/queries/asset-where.test.ts` can assert the
 * visibility floor directly on the returned object — the highest-stakes
 * invariant in this module (the moderation cascade depends on it)
 * should not be defended only by today's code being correct.
 */
export function buildWhere(filters: AssetFilters, omitCategory: boolean): Prisma.AssetWhereInput {
  const where: Prisma.AssetWhereInput = { ...VISIBILITY_FLOOR }

  if (!omitCategory && filters.categories.length > 0) {
    where.category = { in: filters.categories }
  }
  if (filters.countries.length > 0) {
    where.country = { in: filters.countries }
  }
  if (filters.businessStatuses.length > 0) {
    where.businessStatus = { in: filters.businessStatuses }
  }
  if (filters.priceMinCents !== null || filters.priceMaxCents !== null) {
    where.askingPriceCents = {
      ...(filters.priceMinCents !== null ? { gte: BigInt(filters.priceMinCents) } : {}),
      ...(filters.priceMaxCents !== null ? { lte: BigInt(filters.priceMaxCents) } : {}),
    }
  }
  if (filters.q !== '') {
    where.OR = [
      { teaserTitle: { contains: filters.q, mode: 'insensitive' } },
      { teaserDescription: { contains: filters.q, mode: 'insensitive' } },
      { publicRef: { contains: filters.q, mode: 'insensitive' } },
      { businessType: { contains: filters.q, mode: 'insensitive' } },
    ]
  }

  return where
}

// ---------------------------------------------------------------------------
// dashboard ordering and grouping rules
// ---------------------------------------------------------------------------

/**
 * The minimum shape `compareRecommendedAssets` needs: a stable identity, a
 * recency signal, and the score the listing earned against one buyer's
 * mandate.
 */
export interface AssetRecommendationKey {
  id: string
  publishedAt: Date | null
  score: number
}

/**
 * The buyer dashboard's recommendation order: score descending, ties broken
 * by `publishedAt` descending, then `id` ascending — a total order, so no two
 * distinct listings can compare equal and the top-`limit` slice is
 * deterministic across renders.
 *
 * Deliberately *not* the mirror image of `compareBuyersByScore`
 * (`@/server/queries/buyer-where`), which breaks a score tie on
 * `specificity` descending. That key discriminates there because each buyer
 * in the list brings their own mandate; here every listing in the list is
 * scored against the *same* buyer's single mandate, so `specificity` is one
 * constant across the whole list and could never separate two rows. Copying
 * the key across for symmetry's sake would have added a comparison that can
 * never fire, and a sort key that cannot change an outcome reads to the next
 * maintainer as a rule that is doing something.
 *
 * `publishedAt` is nullable on the schema and null sorts last (treated as the
 * epoch). Every row this comparator actually sees satisfies `VISIBILITY_FLOOR`
 * and so is `PUBLISHED`, which in practice always carries a `publishedAt` —
 * the branch is defensive, not a case the dashboard is expected to hit.
 */
export function compareRecommendedAssets(
  a: AssetRecommendationKey,
  b: AssetRecommendationKey,
): number {
  if (a.score !== b.score) return b.score - a.score
  const aPublished = a.publishedAt?.getTime() ?? 0
  const bPublished = b.publishedAt?.getTime() ?? 0
  if (aPublished !== bPublished) return bPublished - aPublished
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The order the seller dashboard renders its listing groups in: what needs
 * the seller to do something, first.
 *
 * `REJECTED` leads rather than `PENDING_REVIEW` — the brief requires both
 * "surfaced first" and this is the split within that pair. A rejected listing
 * is blocked on the seller (read the `rejectionReason`, fix it, resubmit); a
 * pending one is blocked on a manager and there is nothing the seller can do
 * but wait. `PUBLISHED` follows as the live catalogue, then `DRAFT` (started,
 * never submitted), and the two terminal states — `SUSPENDED` (a manager took
 * it down) and `SOLD` — last.
 *
 * Exhaustive over `AssetStatus` by construction: `satisfies` makes a new enum
 * member a type error here rather than a section that silently stops
 * rendering (see `groupByOrder`, `@/lib/group`).
 */
export const SELLER_STATUS_ORDER = [
  'REJECTED',
  'PENDING_REVIEW',
  'PUBLISHED',
  'DRAFT',
  'SUSPENDED',
  'SOLD',
] as const satisfies readonly AssetStatus[]

/** The minimum shape `mostRecentlyPublishedId` needs to pick one listing. */
export interface PublishedRecencyKey {
  id: string
  status: AssetStatus
  publishedAt: Date | null
}

/**
 * The seller's most recently published listing — the one the dashboard scores
 * buyers against ("top matched buyers for the most recently published
 * listing"), and `null` when they have none.
 *
 * Only `PUBLISHED` rows are eligible: `listBuyers`' own ownership check
 * (`loadOwnedAssetCriteria`, `@/server/queries/buyers`) would happily score
 * against a draft the seller owns, but a draft has no audience yet, and a
 * `SOLD` listing's matched buyers are a list of people to no longer contact.
 *
 * A `PUBLISHED` row with a null `publishedAt` never wins over one with a
 * date, and ties break on `id` ascending so the choice is deterministic
 * rather than dependent on the order rows came back in.
 */
export function mostRecentlyPublishedId(
  assets: readonly PublishedRecencyKey[],
): string | null {
  let best: PublishedRecencyKey | null = null
  for (const asset of assets) {
    if (asset.status !== 'PUBLISHED') continue
    if (best === null) {
      best = asset
      continue
    }
    const bestTime = best.publishedAt?.getTime() ?? -Infinity
    const time = asset.publishedAt?.getTime() ?? -Infinity
    if (time > bestTime || (time === bestTime && asset.id < best.id)) {
      best = asset
    }
  }
  return best?.id ?? null
}

/**
 * The minimum shape `compareRequestQueues` needs: which listing the queue
 * belongs to, and when its oldest still-undecided request came in
 * (`null` when the queue holds only already-approved grants).
 */
export interface RequestQueueKey {
  publicRef: string
  oldestPendingAt: Date | null
}

/**
 * The seller dashboard's order for the per-listing access-request queues:
 * the listing whose oldest request has been waiting longest, first.
 *
 * FIFO by *oldest* pending request rather than by count, because the thing a
 * seller owes a buyer is an answer and the buyer who has waited longest is
 * owed it most; a listing with four requests filed this morning is less
 * urgent than one with a single request from last week. Queues with nothing
 * left to decide (approved grants only, kept on screen so access can still be
 * revoked) sort after every queue that still has a pending request, and
 * `publicRef` ascending is the final tie-break so the order is total.
 */
export function compareRequestQueues(a: RequestQueueKey, b: RequestQueueKey): number {
  if (a.oldestPendingAt === null || b.oldestPendingAt === null) {
    if (a.oldestPendingAt !== b.oldestPendingAt) {
      return a.oldestPendingAt === null ? 1 : -1
    }
  } else {
    const byAge = a.oldestPendingAt.getTime() - b.oldestPendingAt.getTime()
    if (byAge !== 0) return byAge
  }
  return a.publicRef < b.publicRef ? -1 : a.publicRef > b.publicRef ? 1 : 0
}
