import type { Prisma } from '@/generated/prisma/client'
import type { AssetFilters, AssetSort } from '@/lib/filters/asset-filters'

/**
 * Pure query-shape logic, deliberately kept out of `assets.ts`: this module
 * imports only *types* from the generated Prisma client (`import type`, so
 * nothing at runtime pulls the client in) and never imports `@/server/db`.
 * `@/server/db` constructs the Prisma client eagerly at module load and
 * fails fast without `DATABASE_URL` — fine for the query module that
 * actually talks to Postgres, but wrong for the module defending the
 * visibility floor, which should be testable as ordinary pure logic with no
 * database, no connection string, and no environment at all.
 */

/**
 * The floor every catalog query enforces, independent of who is asking:
 * published listings from sellers whose account is still active. Nothing in
 * this module — or in any caller — can widen it; Task 20's moderation
 * cascade (suspending a seller) depends on exactly this being unconditional.
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
 * invariant in this module (Task 20's moderation cascade depends on it)
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
