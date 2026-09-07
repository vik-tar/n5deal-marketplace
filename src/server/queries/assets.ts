import type { AccessStatus, AssetStatus, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import {
  categoryCountsInOrder,
  parseAssetFilters,
  type AssetFilters,
  type CategoryCount,
} from '@/lib/filters/asset-filters'
import { PAGE_SIZE } from '@/lib/filters/shared'
import { isFullAsset, toAssetDto, toTeaserAsset, type AssetDto, type TeaserAsset } from '@/lib/dto/asset'
import {
  assetStatusAllowsEditing,
  canDecideAccess,
  canModerate,
  canRequestAccess,
  canViewAsset,
  canViewFullAsset,
  contactAvailability,
  isOwner,
  type AssetRef,
  type ContactAvailability,
  type GrantState,
  type MaybeViewer,
} from '@/lib/authz'
import { mapGrantState, selectGateStatus, type GateStatus } from '@/lib/gate'
import {
  isMandateRankable,
  isRecommendableMatch,
  mandateSpecificity,
  scoreMatch,
  type MatchResult,
} from '@/lib/matching'
import { groupByOrder } from '@/lib/group'
import {
  buildWhere,
  compareRecommendedAssets,
  compareRequestQueues,
  mostRecentlyPublishedId,
  SELLER_STATUS_ORDER,
  SORT_ORDER,
  VISIBILITY_FLOOR,
} from './asset-where'
import { unreadForViewerWhere } from './conversation-where'
// `getRecommendedAssets` needs one buyer's mandate in `MandateCriteria`
// shape. Rather than restate the six-column select and the `bigint` →
// `number` narrowing here, it borrows Task 17's single definition of both
// from the buyer query module. No cycle: `buyers.ts` imports `buyer-where`
// and `@/lib/*` only, never this file.
import { MANDATE_SELECT, toMandateCriteria } from './buyers'

/**
 * One category's result count under the current filters, for the sidebar
 * checkboxes and the landing page's category strip.
 *
 * An alias rather than its own interface: the shape is declared once, in
 * `@/lib/filters/asset-filters` beside `ASSET_CATEGORIES` and
 * `categoryCountsInOrder`, so the module that owns the category universe also
 * owns the shape of "a category and its count". The name stays because every
 * existing caller (`FilterSidebar`, `listAssets`) speaks of facets.
 */
export type CategoryFacet = CategoryCount

export interface ListAssetsResult {
  items: TeaserAsset[]
  total: number
  /**
   * Summed asking prices across the *same* matching set `total` counts, in
   * cents, already narrowed from Prisma's `bigint` (see `toTeaserAsset`,
   * `@/lib/dto/asset`, for the same narrowing on a row). `0` for an empty
   * result, never `null`.
   *
   * Only the landing page reads it, and that is deliberate rather than
   * accidental scope creep. The hero prints a count and a combined value
   * side by side, and those two figures have to describe one set or the page
   * is stating two facts about two different marketplaces. Returning the sum
   * from here — off the one `where` this function built, in the one
   * `$transaction` it already runs — is what makes that true by
   * construction. It costs nothing: the sum rides along on the aggregate
   * that replaced the standalone `count`, so the catalog issues exactly as
   * many statements as before.
   */
  totalValueCents: number
  facets: CategoryFacet[]
}

/**
 * The public catalog: one page of teasers, the total matching count for
 * pagination, the summed asking price across that same count, and
 * per-category counts for the sidebar.
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

  // One `aggregate` rather than a `count` plus a separate `aggregate`: the
  // row count and the summed asking price come back as two fields of a
  // single result, off a single `where` binding, so no future edit can leave
  // them describing different sets. The landing hero prints both next to
  // each other and that is the invariant it depends on — see
  // `totalValueCents` above and `getMarketplaceSummary` below. A pair of
  // statements in the same `$transaction` would already share a snapshot,
  // but it would also be two places for a `where` to drift; one statement
  // removes the question instead of answering it.
  const [rows, totals, facetRows] = await prisma.$transaction([
    prisma.asset.findMany({
      where,
      orderBy: SORT_ORDER[filters.sort],
      skip,
      take: PAGE_SIZE,
    }),
    prisma.asset.aggregate({
      where,
      _count: { _all: true },
      _sum: { askingPriceCents: true },
    }),
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

  return {
    items,
    total: totals._count._all,
    // `bigint` → `number` at the read, in this module, so nothing downstream
    // has to know the column is a `bigint`: React cannot serialise one across
    // the server/client boundary, and `Number.MAX_SAFE_INTEGER` is €90
    // trillion in cents. `null` is what Prisma returns for a sum over zero
    // rows, not an error. The fallback is the `number` `0` rather than the
    // `bigint` `0n` because this project's `tsconfig` target predates BigInt
    // literals — `Number()` takes either.
    totalValueCents: Number(totals._sum.askingPriceCents ?? 0),
    facets,
  }
}

/**
 * How many recently published listings the landing page shows. Six fills two
 * rows of the grid it renders into and is deliberately half a catalog page —
 * this is a sample that ends in "see all", not a second catalog.
 *
 * It must stay `<= PAGE_SIZE`: `getMarketplaceSummary` slices these off the
 * first catalog page rather than running its own `findMany`, so a limit
 * larger than a page would silently return fewer rows than it asks for.
 */
const LANDING_RECENT_LIMIT = 6

/** Everything the landing page shows, all of it derived from one catalog read. */
export interface MarketplaceSummary {
  /**
   * The number the hero prints, and — by construction, not by coincidence —
   * the number the catalog header prints for the same viewer with no filters
   * applied.
   */
  listingCount: number
  /**
   * Summed asking prices across the same set `listingCount` counts, in cents.
   * `0` for an empty catalog, never `null` — the hero formats this with
   * `formatCents` and "€0" is a sane thing to render where `NaN` is not.
   *
   * "The same set" is guaranteed here, not asserted: both fields are copied
   * out of one `ListAssetsResult`, which produced them from one `where` in
   * one `aggregate`. See `ListAssetsResult.totalValueCents`.
   */
  totalValueCents: number
  /** All five categories, in the product's order, zero-filled. */
  categories: CategoryFacet[]
  /** The newest `LANDING_RECENT_LIMIT` listings, in the catalog's own order. */
  recent: TeaserAsset[]
}

/**
 * The landing page's figures.
 *
 * **Every number here comes from `listAssets` itself**, called with the
 * filters an empty query string parses to — which is exactly what an
 * anonymous visitor opening `/listings` gets. That is the whole point of this
 * function's shape. A landing page that counts published listings on its own
 * is one edit away from disagreeing with the catalog it links to, and the
 * half that gets forgotten is never `status: 'PUBLISHED'` — it is the seller's
 * account status, the second half of `VISIBILITY_FLOOR` (`./asset-where`).
 * The seeded database makes the difference visible: 35 rows are `PUBLISHED`
 * and 34 are in the catalog, because one belongs to a suspended seller.
 * Calling the catalog's own query means this page cannot be the surface that
 * says 35.
 *
 * `parseAssetFilters({})` rather than a hand-written "no filters" object for
 * the same reason: `@/lib/filters/asset-filters` owns what "no filters" means
 * (including the default `newest` sort and page 1), and the catalog reaches
 * that value through this same parser.
 *
 * Three consequences worth stating, because each is a decision:
 *
 * - **The facets are the category strip's counts.** They are per-category
 *   counts over `buildWhere(filters, true)` — every active filter except the
 *   category selection — and with no filters set that is the floor alone. So
 *   each tile's number is the `total` its own `?categories=X` URL will
 *   produce when followed, computed by the same builder rather than by a
 *   second query that would have to be kept in step. `categoryCountsInOrder`
 *   then zero-fills and reorders them; see its doc for why both are needed.
 * - **The recent listings are the first page's first six.** `listAssets`
 *   already returned page 1 under the default `newest` sort, so slicing is
 *   free and — more importantly — guarantees these are literally the six the
 *   catalog shows at the top of its list, rather than six rows a second
 *   `findMany` ordered by a comparator someone has to keep identical.
 * - **The count and the value are one database result, not two agreeing
 *   ones.** The hero prints them side by side ("34 licensed institutions for
 *   sale" / "€170.5M combined asking price"), so if they ever described
 *   different sets the page would be stating two facts about two different
 *   marketplaces — the exact failure this function exists to prevent, only
 *   inside the hero rather than between the hero and the catalog. An earlier
 *   version of this code took the count from `listAssets` and ran its own
 *   `prisma.asset.aggregate` here against `buildWhere(filters, false)`. Both
 *   sides called the same builder, so they agreed — but only by convention:
 *   `listAssets`' own doc comment anticipates a viewer-dependent future, and
 *   the day it narrowed or widened its `where` after calling `buildWhere`,
 *   the count would have moved and the value would not. The sum therefore
 *   moved into `listAssets`, onto the aggregate that already produces
 *   `total`. Widening `ListAssetsResult` "for a number only this page wants"
 *   is the price, and it is the right price: it is what turns the agreement
 *   into something a refactor cannot break.
 *
 * There is consequently exactly one count in play. `listAssets` returns
 * `total` and this function copies it into `listingCount`; the catalog header
 * prints the same field from the same function. No second count exists to
 * drift out of step with either the value beside it or the catalog it links
 * to — which is why the invariant below can be stated as a fact rather than
 * as a rule someone has to keep.
 *
 * `viewer` is threaded through to `listAssets` rather than hardcoded to
 * `null`. Today that query provably ignores it — the floor is
 * viewer-independent — but if it ever stopped ignoring it, a landing page
 * pinned to the anonymous view would start disagreeing with the catalog for
 * exactly the viewers whose view changed, which is the failure this whole
 * function is shaped to prevent.
 */
export async function getMarketplaceSummary(
  viewer: MaybeViewer,
): Promise<MarketplaceSummary> {
  const catalog = await listAssets(parseAssetFilters({}), viewer)

  return {
    listingCount: catalog.total,
    totalValueCents: catalog.totalValueCents,
    categories: categoryCountsInOrder(catalog.facets),
    recent: catalog.items.slice(0, LANDING_RECENT_LIMIT),
  }
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
   * Whether "Contact seller" should be offered as a live control (Task 19),
   * and if not, why not. The mirror of `BuyerDetail.canContact`
   * (`@/server/queries/buyers`) on the other side of the market, and it
   * answers the same question that page's button asks: would
   * `startConversation` (`@/server/actions/messages`) accept this click?
   *
   * That is deliberately narrower than `canMessage` alone. `canMessage` would
   * let one seller message another, but a `Conversation` has a buyer side and
   * a seller side, and a viewer with no `BuyerProfile` cannot occupy the
   * former — the action refuses them with `FORBIDDEN`. Offering a control
   * that is guaranteed to fail is the same class of inconsistency Task 13
   * removed between the catalog and this page, so the buyer-profile
   * requirement is part of the answer rather than a surprise behind it.
   *
   * A `ContactAvailability` rather than the boolean it was, because the
   * button is rendered disabled and has to explain itself, and one boolean
   * cannot carry three different explanations. `contactAvailability`
   * (`@/lib/authz`) is now where the two-part rule lives; both sides of the
   * market call it instead of each spelling it out.
   */
  canContactSeller: ContactAvailability
  /**
   * The requests the owning seller (or a manager) may act on for *this*
   * listing — empty for every other viewer. `getSellerOverview` below
   * aggregates the equivalent queue across a seller's whole catalog for the
   * dashboard, built on this same row projection rather than as a second,
   * parallel approve/decline surface. This per-listing slice came first, in
   * Task 14, so that `decideAccess` and `revokeAccess`
   * (`@/server/actions/access-requests`) had a real place to be invoked from
   * on the listing they act on, instead of sitting unreachable until the
   * dashboard landed in Task 18.
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
  /**
   * Whether this viewer may actually approve or decline the rows in
   * `pending` — `canDecideAccess` (`@/lib/authz`), which is `isOwner` and a
   * `'REQUESTED'` grant, nothing else.
   *
   * It is not the same question as "may this viewer see the queue at all",
   * and conflating the two put two dead buttons in front of every manager.
   * `getAssetRequestQueue` returns real pending rows to `isOwner ||
   * canModerate`, but a `MANAGER` holds no `SellerProfile`, so `isOwner` is
   * false for every asset and `decideAccess` (`@/server/actions/access-requests`)
   * answered their every click with `FORBIDDEN` — surfaced as "This request
   * can no longer be acted on", which is false twice over: it could, and not
   * by them. Revoke on the same card is genuinely theirs
   * (`canRevokeAccess` admits `canModerate`), so the card was half-live
   * rather than obviously broken.
   *
   * Decided here rather than in the component for the reason
   * `AssetDetail.gateStatus` above documents: the component would have to
   * re-derive it from data it does not have, and a stand-in that happens to
   * be right today cannot fail a review.
   */
  canDecide: boolean
}

/**
 * The `AccessRequest` columns both queue readers select. Named as a type so
 * `appendRequestRow` below is checked against one shape rather than against
 * whatever each `select` happened to ask for.
 */
interface AccessRequestQueueRow {
  id: string
  status: AccessStatus
  message: string
  requestedAt: Date
  decidedAt: Date | null
  buyerProfile: { displayName: string }
}

/**
 * The single row → `PendingRequestSummary` | `ApprovedGrantSummary`
 * projection, shared by the per-listing `getAssetRequestQueue` below and by
 * `getSellerOverview`'s catalogue-wide equivalent (Task 14's handoff to
 * Task 18: build the wider shape *on top of* the same row projection types
 * rather than writing a second, parallel approve/decline surface).
 *
 * Both callers filter to `status in (REQUESTED, APPROVED)` before this runs,
 * so the `else` branch is the approved case; a `DECLINED` or `REVOKED` row
 * never reaches here. Only `REQUESTED` rows carry the buyer's message —
 * `ApprovedGrantSummary` deliberately drops it, because once a grant is live
 * the message that asked for it is history and the seller acts on the grant.
 */
function appendRequestRow(queue: AssetRequestQueue, row: AccessRequestQueueRow): void {
  if (row.status === 'REQUESTED') {
    queue.pending.push({
      id: row.id,
      buyerDisplayName: row.buyerProfile.displayName,
      message: row.message,
      requestedAt: row.requestedAt,
    })
  } else {
    queue.approved.push({
      id: row.id,
      buyerDisplayName: row.buyerProfile.displayName,
      decidedAt: row.decidedAt,
    })
  }
}

/**
 * The pending and approved `AccessRequest` rows against one listing, for its
 * owning seller to decide and for either the seller or a manager to revoke.
 * Returns empty arrays — never an error, never partial data — for anyone
 * else, including the requesting buyers themselves: a buyer already sees
 * their own standing via `grant`/`gateStatus` above, and must not learn about
 * another buyer's request against the same listing.
 *
 * **Reading the queue and deciding it are two different permissions**, and
 * they are answered by two different predicates here. A manager may read it
 * (`canModerate`) and may revoke an approved grant (`canRevokeAccess`), but
 * may not approve or decline: `canDecideAccess` is `isOwner && grant ===
 * 'REQUESTED'`, and a `MANAGER` holds no `SellerProfile`. `queue.canDecide`
 * carries that second answer to the component so the buttons match it.
 *
 * This is a real, narrow query, not a stand-in: unlike `listAssets`'s
 * removed per-row `canViewAsset` re-check (see the doc comment on
 * `listAssets`), the `isOwner`/`canModerate` guard here is the only gate
 * between "no rows" and "this seller's real requests", so it is load-bearing
 * and worth keeping.
 */
async function getAssetRequestQueue(ref: AssetRef, viewer: MaybeViewer): Promise<AssetRequestQueue> {
  // `'REQUESTED'` rather than the viewer's own grant: every row this queue
  // can offer a decision on is a pending one by construction, and the
  // per-row grant is exactly what `decideAccess` re-reads before it writes.
  const canDecide = canDecideAccess(viewer, ref, 'REQUESTED')

  if (!isOwner(viewer, ref) && !canModerate(viewer)) {
    return { pending: [], approved: [], canDecide: false }
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

  const queue: AssetRequestQueue = { pending: [], approved: [], canDecide }
  for (const row of rows) {
    appendRequestRow(queue, row)
  }
  return queue
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
        // `user.id` joins the four `SellerSummary` fields for one reason:
        // `canMessage` identifies a counterparty by user id, and "may I
        // contact this seller" cannot be answered without it. It is not
        // carried into `seller` below — nothing renders it.
        select: {
          id: true,
          companyName: true,
          country: true,
          verified: true,
          user: { select: { id: true, status: true } },
        },
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
    canContactSeller: contactAvailability(
      viewer,
      { userId: sellerProfile.user.id, status: sellerProfile.user.status },
      // Contacting a seller puts the viewer on the buyer side of the thread.
      'BUYER',
    ),
    requestQueue,
  }
}

// ---------------------------------------------------------------------------
// Task 18 — dashboard reads
// ---------------------------------------------------------------------------

/** One recommended listing and the deterministic score that put it there. */
export interface AssetRecommendation {
  asset: TeaserAsset
  match: MatchResult
}

export interface RecommendedAssetsResult {
  items: AssetRecommendation[]
  /**
   * How many of the five criteria the buyer's mandate constrains, 0-5, carried
   * out of the query so the page can label the ranking with what it is based
   * on — a 100 from two criteria is not the same claim as a 100 from five —
   * without re-reading the mandate or recomputing `mandateSpecificity`.
   *
   * At 0 this is also the reason `items` is empty; see below.
   */
  specificity: number
  /**
   * How many published listings were scored to produce `items`: the
   * denominator the page prints beside the ranking, and — when `items` comes
   * back empty — what tells "your mandate excluded every listing" apart from
   * "nothing is published yet", which are the same empty list with opposite
   * advice. It is 0 when `specificity` is 0, because in that case nothing is
   * scored at all; the page never reaches the distinction in that branch,
   * having rendered the mandate prompt instead.
   */
  consideredCount: number
}

/**
 * The buyer dashboard's recommendations: the published listings from active
 * sellers that best fit this buyer's mandate, best first, `NONE`-banded
 * matches dropped (`isRecommendableMatch`, `@/lib/matching`).
 *
 * **Returns nothing at all when the mandate constrains nothing**
 * (`isMandateRankable`). A mandate at `specificity` 0 makes every criterion
 * score `NO_PREFERENCE`, so all 34 published listings tie at exactly 100 in
 * the `STRONG` band and the order would come entirely from the tie-break —
 * a ranking that is not weak but fabricated. The rule is enforced here, in
 * the query, and not only in the component that renders the prompt in its
 * place: a ranking that must never be displayed should not be computed, and
 * handing it back anyway would leave a correct-looking array sitting in the
 * return type for the next caller to render in good faith.
 *
 * The scoring runs in memory over every listing the visibility floor admits,
 * rather than being pushed into SQL — exactly as `listBuyers`
 * (`@/server/queries/buyers`) and `countMandateMatches`
 * (`@/server/actions/profile`) already do for their own mirror-image
 * questions. At 34 published listings that is correct, simple, and shares one
 * `scoreMatch` implementation with the seller's view of the same pair, so the
 * two sides of a match can never disagree. It is also the thing this
 * prototype would change first at scale: see the README's "Matching at scale"
 * note.
 *
 * `VISIBILITY_FLOOR` (`@/server/queries/asset-where`) is reused verbatim
 * rather than re-expressed, so a recommendation can never surface a listing
 * the public catalog would not — including a suspended seller's, which is
 * what Task 20's moderation cascade depends on.
 *
 * The read carries no `select`, so the confidential columns do come into
 * memory, exactly as `listAssets` above already does: `toTeaserAsset`
 * (`@/lib/dto/asset`) takes a whole `Asset` and builds the teaser from its
 * public allowlist, so nothing confidential can reach a component. This is
 * weaker than `getAssetDetail`'s "never constructed" guarantee, which can
 * afford to be stronger because it fetches one row and knows the viewer's
 * grant; here the gate is the DTO, not the query. Worth revisiting alongside
 * the README's "Matching at scale" note, which would replace this read
 * anyway.
 */
export async function getRecommendedAssets(
  buyerProfileId: string,
  limit: number,
): Promise<RecommendedAssetsResult> {
  const mandateRow = await prisma.mandate.findUnique({
    where: { buyerProfileId },
    select: MANDATE_SELECT,
  })
  // A buyer with no `Mandate` row at all is legitimate (Task 16's ruling 2)
  // and lands on `specificity` 0 through the same path as a saved-but-empty
  // mandate — one branch below covers both.
  const criteria = toMandateCriteria(mandateRow)
  const specificity = mandateSpecificity(criteria)
  if (!isMandateRankable(specificity)) {
    return { items: [], specificity, consideredCount: 0 }
  }

  const rows = await prisma.asset.findMany({ where: VISIBILITY_FLOOR })

  const scored = rows.map((row) => {
    const match = scoreMatch(criteria, {
      category: row.category,
      country: row.country,
      licenceType: row.licenceType,
      businessStatus: row.businessStatus,
      // `bigint` → `number` at the read (ruling 6). `toTeaserAsset` below
      // narrows the same column again for the DTO; this one feeds
      // `scoreMatch`, which compares it against the mandate's already-narrowed
      // ticket bounds.
      askingPriceCents: Number(row.askingPriceCents),
    })
    return { id: row.id, publishedAt: row.publishedAt, score: match.score, row, match }
  })

  const ranked = scored
    .filter((entry) => isRecommendableMatch(entry.match))
    .sort(compareRecommendedAssets)

  // `Math.trunc` and the floor at 0 make a nonsense `limit` (negative, or
  // fractional from arithmetic upstream) return nothing rather than throwing
  // or silently slicing from the end, which is what a bare negative index
  // into `slice` would do.
  const take = Math.max(0, Math.trunc(limit))

  return {
    items: ranked.slice(0, take).map((entry) => ({
      asset: toTeaserAsset(entry.row),
      match: entry.match,
    })),
    specificity,
    consideredCount: rows.length,
  }
}

/** One of the seller's own listings, as their dashboard lists it. */
export interface SellerListingSummary {
  id: string
  publicRef: string
  teaserTitle: string
  status: AssetStatus
  askingPriceCents: number
  /** Only ever non-null on a `REJECTED` listing; the dashboard shows it verbatim. */
  rejectionReason: string | null
  publishedAt: Date | null
  viewCount: number
  /**
   * Whether the dashboard should offer "Edit" on this row.
   *
   * `SELLER_STATUS_ORDER` includes `SOLD`, and the dashboard renders every
   * group, so before this field every seller with a sold listing was shown
   * an Edit link that leads to a 404: `canEditAsset` (`@/lib/authz`) refuses
   * a `SOLD` listing and the edit page `notFound()`s on it. Reachable on the
   * demo seller's own dashboard — the seed puts the single `SOLD` listing on
   * `seller@n5deal.demo`.
   *
   * `assetStatusAllowsEditing` and not `canEditAsset`, uniquely here,
   * because this query takes a `sellerProfileId` and no viewer (see below):
   * every row is the caller's own by construction, so `isOwner` is
   * structural and only the status half is left to decide. It is still the
   * predicate module's rule, not a `!== 'SOLD'` written out again in a
   * component.
   */
  canEdit: boolean
}

/** The seller's listings in one `AssetStatus`, in `SELLER_STATUS_ORDER`. */
export interface SellerListingGroup {
  status: AssetStatus
  listings: SellerListingSummary[]
}

/**
 * One listing's access-request queue, plus enough of the listing to say which
 * one it belongs to. The `queue` is the exact `AssetRequestQueue` the
 * per-listing detail page uses, so `AccessRequestQueue`
 * (`@/components/domain/access-request-queue`) renders it unchanged.
 */
export interface SellerRequestQueue {
  asset: { id: string; publicRef: string; teaserTitle: string }
  queue: AssetRequestQueue
}

export interface SellerOverview {
  listingGroups: SellerListingGroup[]
  listingCount: number
  requestQueues: SellerRequestQueue[]
  pendingRequestCount: number
  unreadMessageCount: number
  /**
   * The listing the dashboard scores buyers against
   * (`mostRecentlyPublishedId`, `@/server/queries/asset-where`), or `null` for
   * a seller with nothing published. The page passes it straight to
   * `listBuyers` as `forAssetId`, which re-checks ownership itself — this is a
   * convenience, not a capability.
   */
  mostRecentPublishedAssetId: string | null
}

function emptySellerOverview(): SellerOverview {
  return {
    listingGroups: [],
    listingCount: 0,
    requestQueues: [],
    pendingRequestCount: 0,
    unreadMessageCount: 0,
    mostRecentPublishedAssetId: null,
  }
}

/**
 * Everything the seller dashboard shows: their whole catalogue grouped by
 * status, the access requests standing against it, and their unread message
 * count.
 *
 * **On composing rather than duplicating `getAssetRequestQueue`** (Task 14's
 * handoff, binding here). The dashboard genuinely needs the catalogue-wide
 * shape — a seller with nine listings must not have to open nine pages to
 * find the two buyers waiting on an answer — and calling the per-listing
 * query once per asset would be N round trips to reconstruct one query's
 * worth of rows. So this reads the same rows in a single query and projects
 * them through the *same* `appendRequestRow` into the *same*
 * `PendingRequestSummary` / `ApprovedGrantSummary` / `AssetRequestQueue`
 * types, then hands each queue to the *same* `AccessRequestQueue` client
 * component. There is one approve/decline surface in this app and one row
 * projection behind it; what is new here is only the grouping by listing.
 *
 * Approved grants ride along with the pending ones, exactly as they do on the
 * listing page, because the component that renders them offers `revoke` and a
 * seller reviewing who is waiting is also the seller who might withdraw
 * someone's access. Listings with neither are omitted entirely rather than
 * rendered as empty cards.
 *
 * Takes a `sellerProfileId` and no viewer for the same reason
 * `getBuyerOverview` (`@/server/queries/buyers`) does: the id always comes
 * from `viewer.sellerProfileId`, never from a URL. An id matching no row
 * returns the empty overview rather than throwing.
 *
 * The unread count excludes the seller's own messages — see the note on
 * `getBuyerOverview`, which has the identical problem in the other
 * direction, and `unreadForViewerWhere` (`@/server/queries/conversation-where`),
 * which is now the one definition both of them and `/inbox` share.
 */
export async function getSellerOverview(sellerProfileId: string): Promise<SellerOverview> {
  const profile = await prisma.sellerProfile.findUnique({
    where: { id: sellerProfileId },
    select: { userId: true },
  })
  if (!profile) return emptySellerOverview()

  const [assetRows, requestRows, unreadMessageCount] = await prisma.$transaction([
    prisma.asset.findMany({
      where: { sellerProfileId },
      // Newest first within each status group, `id` ascending as the
      // total-order tail. Ordering on `createdAt` rather than `publishedAt`
      // is deliberate: `publishedAt` is null for every listing that was never
      // published and Postgres sorts nulls first under `DESC`, which would
      // put a seller's oldest drafts above their newest ones. `createdAt` is
      // non-null on every row, so one key orders every group correctly.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        publicRef: true,
        teaserTitle: true,
        status: true,
        askingPriceCents: true,
        rejectionReason: true,
        publishedAt: true,
        viewCount: true,
      },
    }),
    prisma.accessRequest.findMany({
      where: { asset: { sellerProfileId }, status: { in: ['REQUESTED', 'APPROVED'] } },
      // Oldest first, so `pending[0]` below is the request that has been
      // waiting longest — which is the key `compareRequestQueues` orders the
      // listings by.
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        message: true,
        requestedAt: true,
        decidedAt: true,
        buyerProfile: { select: { displayName: true } },
        asset: { select: { id: true, publicRef: true, teaserTitle: true } },
      },
    }),
    prisma.message.count({
      where: { conversation: { sellerProfileId }, ...unreadForViewerWhere(profile.userId) },
    }),
  ])

  const listings: SellerListingSummary[] = assetRows.map((row) => ({
    id: row.id,
    publicRef: row.publicRef,
    teaserTitle: row.teaserTitle,
    status: row.status,
    // `bigint` → `number` at the read (ruling 6): these rows are hand-built
    // summaries, not `AssetDto`s, so nothing downstream would narrow them.
    askingPriceCents: Number(row.askingPriceCents),
    rejectionReason: row.rejectionReason,
    publishedAt: row.publishedAt,
    viewCount: row.viewCount,
    canEdit: assetStatusAllowsEditing(row.status),
  }))

  const queuesByAsset = new Map<string, SellerRequestQueue>()
  for (const row of requestRows) {
    let entry = queuesByAsset.get(row.asset.id)
    if (entry === undefined) {
      // `canDecide: true` without a `canDecideAccess` call, uniquely here:
      // every row in this read is `{ asset: { sellerProfileId } }` where
      // `sellerProfileId` came from `viewer.sellerProfileId`, so `isOwner`
      // holds structurally rather than as something to check. The
      // per-listing `getAssetRequestQueue` above, which serves a page any
      // manager can open, decides it with the predicate.
      entry = { asset: row.asset, queue: { pending: [], approved: [], canDecide: true } }
      queuesByAsset.set(row.asset.id, entry)
    }
    appendRequestRow(entry.queue, row)
  }

  const requestQueues = [...queuesByAsset.values()].sort((a, b) =>
    compareRequestQueues(
      { publicRef: a.asset.publicRef, oldestPendingAt: a.queue.pending[0]?.requestedAt ?? null },
      { publicRef: b.asset.publicRef, oldestPendingAt: b.queue.pending[0]?.requestedAt ?? null },
    ),
  )

  return {
    listingGroups: groupByOrder(
      listings,
      (listing) => listing.status,
      SELLER_STATUS_ORDER,
    ).map(({ key, items }) => ({ status: key, listings: items })),
    listingCount: listings.length,
    requestQueues,
    pendingRequestCount: requestQueues.reduce((sum, entry) => sum + entry.queue.pending.length, 0),
    unreadMessageCount,
    mostRecentPublishedAssetId: mostRecentlyPublishedId(assetRows),
  }
}
