import type { Prisma, AssetCategory } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import type { AssetFilters } from '@/lib/filters/asset-filters'
import { PAGE_SIZE } from '@/lib/filters/shared'
import { toTeaserAsset, type TeaserAsset } from '@/lib/dto/asset'
import type { MaybeViewer } from '@/lib/authz'
import { buildWhere, SORT_ORDER } from './asset-where'

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
