import type { Prisma, AssetCategory } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import type { AssetFilters } from '@/lib/filters/asset-filters'
import { PAGE_SIZE } from '@/lib/filters/shared'
import { isFullAsset, toAssetDto, toTeaserAsset, type AssetDto, type TeaserAsset } from '@/lib/dto/asset'
import {
  canModerate,
  canRequestAccess,
  canViewAsset,
  canViewFullAsset,
  isOwner,
  type AssetRef,
  type GrantState,
  type MaybeViewer,
} from '@/lib/authz'
import { mapGrantState, selectGateStatus, type GateStatus } from '@/lib/gate'
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

/**
 * The seller as shown on the detail page. The seller's identity is exactly
 * as confidential as the asset's own gated fields, and is redacted by the
 * same rule: `companyName` is `null` — never sent and then hidden — whenever
 * the gate is closed. `country` and `verified` are safe to show unconditionally
 * (the teaser cards already imply a jurisdiction via the asset's own
 * `country`, and "verified seller" is deliberately the one thing an
 * anonymous visitor is told about who they might be dealing with).
 */
export interface SellerSummary {
  id: string
  companyName: string | null
  country: string
  verified: boolean
}

export interface AssetDetail {
  asset: AssetDto
  grant: GrantState
  seller: SellerSummary
  /**
   * Which of the gate's four states the page should render (`@/lib/gate`).
   * Computed here, not by the page or the component, because the correct
   * answer depends on the asset's real `ownerStatus` — reconstructing it
   * downstream from partial data risks the exact bug this codebase already
   * removed once from `listAssets` (see the doc comment above): a
   * stand-in value that happens to be right today but cannot fail a review
   * because nothing ever re-derives it from the truth.
   */
  gateStatus: GateStatus
  /** The viewer's own request date. Only meaningful when `gateStatus` is `'PENDING'`. */
  requestedAt: Date | null
  /**
   * The requests the owning seller (or a manager) may act on for *this*
   * listing — empty for every other viewer. Task 18's `getSellerOverview`
   * will aggregate the equivalent queue across a seller's whole catalog for
   * the dashboard; this per-listing slice exists so `decideAccess` and
   * `revokeAccess` (`@/server/actions/access-requests`) have a real place to
   * be invoked from today, on the listing they act on, rather than sitting
   * unreachable until that dashboard lands.
   */
  requestQueue: AssetRequestQueue
}

/** One buyer's pending ask, as the owning seller or a manager should see it. */
export interface PendingRequestSummary {
  id: string
  buyerDisplayName: string
  message: string
  requestedAt: Date
}

/** One buyer currently holding an approved grant on this listing. */
export interface ApprovedGrantSummary {
  id: string
  buyerDisplayName: string
  decidedAt: Date | null
}

export interface AssetRequestQueue {
  pending: PendingRequestSummary[]
  approved: ApprovedGrantSummary[]
}

/**
 * The pending and approved `AccessRequest` rows against one listing, for its
 * owning seller or a manager to decide or revoke. Returns empty arrays —
 * never an error, never partial data — for anyone else, including the
 * requesting buyers themselves: a buyer already sees their own standing via
 * `grant`/`gateStatus` above, and must not learn about another buyer's
 * request against the same listing.
 *
 * This is a real, narrow query, not a stand-in: unlike `listAssets`'s
 * removed per-row `canViewAsset` re-check (see the doc comment on
 * `listAssets`), the `isOwner`/`canModerate` guard here is the only gate
 * between "no rows" and "this seller's real requests", so it is load-bearing
 * and worth keeping.
 */
async function getAssetRequestQueue(ref: AssetRef, viewer: MaybeViewer): Promise<AssetRequestQueue> {
  if (!isOwner(viewer, ref) && !canModerate(viewer)) {
    return { pending: [], approved: [] }
  }

  const rows = await prisma.accessRequest.findMany({
    where: { assetId: ref.id, status: { in: ['REQUESTED', 'APPROVED'] } },
    orderBy: { requestedAt: 'asc' },
    select: {
      id: true,
      status: true,
      message: true,
      requestedAt: true,
      decidedAt: true,
      buyerProfile: { select: { displayName: true } },
    },
  })

  const pending: PendingRequestSummary[] = []
  const approved: ApprovedGrantSummary[] = []
  for (const row of rows) {
    if (row.status === 'REQUESTED') {
      pending.push({
        id: row.id,
        buyerDisplayName: row.buyerProfile.displayName,
        message: row.message,
        requestedAt: row.requestedAt,
      })
    } else {
      approved.push({
        id: row.id,
        buyerDisplayName: row.buyerProfile.displayName,
        decidedAt: row.decidedAt,
      })
    }
  }
  return { pending, approved }
}

/**
 * Loads one listing for the detail page and enforces the NDA gate
 * server-side. `toAssetDto` receives only `canViewFullAsset`'s boolean
 * answer, so the confidential fields (`legalName`, `revenueCents`,
 * `ebitdaCents`, `clientCount`, `dataRoomUrl`, `confidentialNotes`) are never
 * constructed — not hidden, not stripped after the fact — unless the gate is
 * genuinely open for this viewer.
 *
 * Returns `null` when `canViewAsset` is false. A listing that exists but is
 * not visible to this viewer (a draft, a suspended seller's listing, another
 * seller's own draft) must look exactly like a listing that does not exist:
 * a 404, never a 403 that would confirm the row is there. That check runs
 * before any other query in this function, so the "hidden" and "does not
 * exist" paths do the same single lookup and return — no extra query marks
 * one case as slower than the other.
 */
export async function getAssetDetail(
  id: string,
  viewer: MaybeViewer,
): Promise<AssetDetail | null> {
  const row = await prisma.asset.findUnique({
    where: { id },
    // `select`, not `include`, on the nested `sellerProfile` — `SellerSummary`
    // names exactly four fields (`id`, `companyName`, `country`, `verified`);
    // pulling the whole relation (`contactName`, `websiteUrl`, `userId`,
    // `createdAt`) would still be built field-by-field into `seller` below
    // today, but it drops the structural guarantee that a future edit which
    // spreads `...sellerProfile` cannot silently leak an extra field — the
    // same reasoning `getViewer` (`@/server/session`) documents for its own
    // `select`.
    include: {
      sellerProfile: {
        select: { id: true, companyName: true, country: true, verified: true, user: { select: { status: true } } },
      },
    },
  })
  if (!row) return null

  const { sellerProfile, ...asset } = row
  const ref: AssetRef = {
    id: asset.id,
    sellerProfileId: asset.sellerProfileId,
    status: asset.status,
    ownerStatus: sellerProfile.user.status,
  }

  if (!canViewAsset(viewer, ref)) return null

  // Only the viewer's own request against this asset — ruling 3 forbids
  // loading every request for it, which would let a buyer learn something
  // about another buyer's standing with this seller.
  const viewerRequest =
    viewer !== null && viewer.buyerProfileId !== null
      ? await prisma.accessRequest.findUnique({
          where: {
            assetId_buyerProfileId: { assetId: asset.id, buyerProfileId: viewer.buyerProfileId },
          },
          select: { status: true, requestedAt: true },
        })
      : null

  const grant = mapGrantState(viewerRequest?.status ?? null)
  const canSeeConfidential = canViewFullAsset(viewer, ref, grant)

  // A view only counts when neither the owner nor a manager is looking —
  // their own visits are not market interest. The same `exempt` viewers are
  // exactly who `getAssetRequestQueue` will return real rows to; everyone
  // else gets `{ pending: [], approved: [] }` without an extra query.
  const exempt = isOwner(viewer, ref) || canModerate(viewer)
  const [current, requestQueue] = await Promise.all([
    exempt
      ? Promise.resolve(asset)
      : prisma.asset.update({
          where: { id: asset.id },
          data: { viewCount: { increment: 1 } },
        }),
    getAssetRequestQueue(ref, viewer),
  ])

  const dto = toAssetDto(current, canSeeConfidential)
  const gateStatus = selectGateStatus({
    isFullAsset: isFullAsset(dto),
    grant,
    canRequest: canRequestAccess(viewer, ref, grant),
    // Re-runs the same predicate with a hypothetical `'NONE'` grant — "if
    // this buyer had never asked, could they request right now?" — so a
    // `'REQUESTED'` grant left behind by an asset later marked `SOLD`, or by
    // a buyer suspended after requesting, renders `'CLOSED'` instead of a
    // stale "Pending" forever. See the doc comment on `selectGateStatus`
    // (`@/lib/gate`) for the full rationale.
    requestStillEligible: canRequestAccess(viewer, ref, 'NONE'),
  })

  return {
    asset: dto,
    grant,
    seller: {
      id: sellerProfile.id,
      companyName: canSeeConfidential ? sellerProfile.companyName : null,
      country: sellerProfile.country,
      verified: sellerProfile.verified,
    },
    gateStatus,
    requestedAt: viewerRequest?.requestedAt ?? null,
    requestQueue,
  }
}
