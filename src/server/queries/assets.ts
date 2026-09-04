import { Prisma, type AssetCategory } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import type { AssetFilters, AssetSort } from '@/lib/filters/asset-filters'
import { PAGE_SIZE } from '@/lib/filters/shared'
import { toTeaserAsset, type TeaserAsset } from '@/lib/dto/asset'
import type { MaybeViewer } from '@/lib/authz'

/** One category's result count under the current filters, for the sidebar checkboxes. */
export interface CategoryFacet {
  category: AssetCategory
  count: number
}

export interface ListAssetsResult {
  items: TeaserAsset[]
  total: number
  facets: CategoryFacet[]
}

/**
 * The floor every catalog query enforces, independent of who is asking:
 * published listings from sellers whose account is still active. Nothing in
 * this module — or in any caller — can widen it; Task 20's moderation
 * cascade (suspending a seller) depends on exactly this being unconditional.
 * Managers and the listing's own seller do not get a wider view here either —
 * moderation and the seller's own dashboard are separate query paths, not a
 * `viewer`-gated branch of the public catalog.
 */
const VISIBILITY_FLOOR = {
  status: 'PUBLISHED',
  sellerProfile: { user: { status: 'ACTIVE' } },
} as const satisfies Prisma.AssetWhereInput

const SORT_ORDER: Record<AssetSort, Prisma.AssetOrderByWithRelationInput[]> = {
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

/**
 * The public catalog: one page of teasers, the total matching count for
 * pagination, and per-category counts for the sidebar.
 *
 * `viewer` is part of the signature for parity with every other query that
 * makes a visibility decision, and because Tasks 18/21 call this function
 * expecting it — but this query does not branch on it: the visibility floor
 * in `buildWhere` is unconditional (see `VISIBILITY_FLOOR`), and there is no
 * per-row re-check here standing in for that guarantee. An earlier version
 * of this function had one (`canViewAsset` applied per row), but it
 * hardcoded `ownerStatus: 'ACTIVE'` for every row instead of the row's real
 * seller status, so it evaluated true unconditionally and could not have
 * caught a regression in `buildWhere` — a check that cannot fail is not a
 * check, so it was removed rather than kept as false reassurance. The floor
 * is instead verified directly, and independently of any live query, by
 * `tests/unit/queries/asset-where.test.ts`.
 */
export async function listAssets(
  filters: AssetFilters,
  viewer: MaybeViewer,
): Promise<ListAssetsResult> {
  // See the doc comment above: accepted for interface parity with Tasks
  // 18/21, not used — this query's visibility floor does not depend on who
  // is asking.
  void viewer
  const where = buildWhere(filters, false)
  const facetWhere = buildWhere(filters, true)
  const skip = (filters.page - 1) * PAGE_SIZE

  // `satisfies` — rather than passing the object literal straight to
  // `groupBy` — is required here: Prisma's generic inference otherwise
  // widens `_count: true` against the broader `AssetCountAggregateInputType
  // | boolean` union, and every row's `_count` comes back typed as that
  // union instead of the `number` the literal `true` actually produces.
  const facetArgs = {
    by: ['category'],
    where: facetWhere,
    orderBy: { category: 'asc' },
    _count: true,
  } satisfies Prisma.AssetGroupByArgs

  const [rows, total, facetRows] = await prisma.$transaction([
    prisma.asset.findMany({
      where,
      orderBy: SORT_ORDER[filters.sort],
      skip,
      take: PAGE_SIZE,
    }),
    prisma.asset.count({ where }),
    prisma.asset.groupBy(facetArgs),
  ])

  const facets: CategoryFacet[] = facetRows.map((row) => ({
    category: row.category,
    count: row._count,
  }))

  // Every row here already satisfies `VISIBILITY_FLOOR` by construction —
  // enforced in `buildWhere`, not re-checked per row (see the doc comment
  // above and `tests/unit/queries/asset-where.test.ts`).
  const items = rows.map(toTeaserAsset)

  return { items, total, facets }
}
