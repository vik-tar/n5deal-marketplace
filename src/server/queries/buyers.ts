import type { AccessStatus, BuyerType } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import type { BuyerFilters } from '@/lib/filters/buyer-filters'
import { PAGE_SIZE } from '@/lib/filters/shared'
import {
  canBrowseBuyers,
  canModerate,
  contactAvailability,
  isOwner,
  type AssetRef,
  type ContactAvailability,
  type MaybeViewer,
} from '@/lib/authz'
import {
  mandateSpecificity,
  scoreMatch,
  type AssetCriteria,
  type MandateCriteria,
  type MatchResult,
} from '@/lib/matching'
import { groupByOrder } from '@/lib/group'
import {
  BUYER_ACCESS_STATUS_ORDER,
  BUYER_SORT_ORDER,
  buildBuyerWhere,
  compareBuyersByRecency,
  compareBuyersByScore,
} from './buyer-where'
import { unreadForViewerWhere } from './conversation-where'

/**
 * A buyer's mandate, plus how many of the five criteria it actually
 * constrains (`mandateSpecificity`, `@/lib/matching`) — carried alongside
 * every list row and the detail page so a consumer can tell a "100 from five
 * constrained criteria" apart from a "100 because nothing is constrained"
 * without recomputing it (ruling 3, Task 17).
 */
export interface BuyerMandateSummary extends MandateCriteria {
  specificity: number
}

/** One row of the buyer catalog. `match` is `null` whenever the list was not scored against a listing. */
export interface BuyerListItem {
  id: string
  displayName: string
  buyerType: BuyerType
  country: string
  verified: boolean
  createdAt: Date
  mandate: BuyerMandateSummary
  match: MatchResult | null
}

export interface ListBuyersResult {
  items: BuyerListItem[]
  total: number
  /**
   * The asset this list was actually scored against, or `null` — never
   * simply an echo of the caller's `forAssetId` argument. It comes back
   * `null` when `forAssetId` was omitted, pointed at a listing that does not
   * exist, or pointed at a listing the caller does not own (ruling 3): a bad
   * or hostile `forAssetId` degrades to the plain, unscored view rather than
   * erroring or trusting a caller-supplied id at face value. The page uses
   * this — not the raw search param — to decide whether to show "scored
   * against" chrome.
   */
  scoredAssetId: string | null
}

/** The full profile and mandate for the buyer detail page (`/buyers/[id]`). */
export interface BuyerDetail {
  id: string
  displayName: string
  buyerType: BuyerType
  country: string
  bio: string
  websiteUrl: string | null
  verified: boolean
  createdAt: Date
  mandate: BuyerMandateSummary
  match: MatchResult | null
  scoredAssetId: string | null
  /**
   * Whether "Contact buyer" should be offered as a live control, and if not,
   * why not: would `startConversation` (`@/server/actions/messages`) accept
   * the click?
   *
   * `canMessage` (`@/lib/authz`) is most of the answer — a manager may never
   * message, and a suspended buyer may not be messaged. Task 19 added the
   * `sellerProfileId` half: a `Conversation` has a seller side, and a viewer
   * with no `SellerProfile` row cannot occupy it, so the action refuses them
   * with `FORBIDDEN`. `canBrowseBuyers` (which gates this whole page) checks
   * the SELLER *role* but not the profile row, so the two are genuinely
   * different questions and a role-only check would light up a button that
   * cannot work.
   *
   * Both halves now come from one call to `contactAvailability`
   * (`@/lib/authz`), which `AssetDetail.canContactSeller`
   * (`@/server/queries/assets`) also calls on the other side of the market —
   * the same rule stated once instead of twice, and a reason rather than a
   * boolean, because the disabled button has to say which of them applies.
   */
  canContact: ContactAvailability
}

/**
 * The six mandate columns `MandateCriteria` is built from, and nothing else —
 * `timelineMonths` and `notes` are the buyer's own planning notes, not
 * comparable facets, and `scoreMatch` has no opinion about them.
 *
 * Exported alongside `toMandateCriteria` for `getRecommendedAssets`
 * (`@/server/queries/assets`), which needs the same buyer's mandate in the
 * same shape to score listings against it. The two functions live in
 * different query modules because they return different things — assets there,
 * buyers here — but "what a mandate row means, including the `bigint` →
 * `number` narrowing" must have exactly one definition, and this is it.
 */
export const MANDATE_SELECT = {
  categories: true,
  countries: true,
  licenceTypes: true,
  businessStatuses: true,
  ticketMinCents: true,
  ticketMaxCents: true,
} as const

export interface MandateRow {
  categories: MandateCriteria['categories']
  countries: string[]
  licenceTypes: string[]
  businessStatuses: MandateCriteria['businessStatuses']
  ticketMinCents: bigint | null
  ticketMaxCents: bigint | null
}

/**
 * A buyer with no `Mandate` row at all — legitimately possible, Task 16's
 * ruling 2 — is treated exactly as a buyer whose mandate constrains nothing:
 * every array empty, both bounds null, `specificity` 0. Money columns are
 * converted from `bigint` to `number` right here, at the read (ruling 6) —
 * the only place in this module a mandate's ticket bounds are touched.
 */
export function toMandateCriteria(mandate: MandateRow | null): MandateCriteria {
  return {
    categories: mandate?.categories ?? [],
    countries: mandate?.countries ?? [],
    licenceTypes: mandate?.licenceTypes ?? [],
    businessStatuses: mandate?.businessStatuses ?? [],
    ticketMinCents: mandate?.ticketMinCents != null ? Number(mandate.ticketMinCents) : null,
    ticketMaxCents: mandate?.ticketMaxCents != null ? Number(mandate.ticketMaxCents) : null,
  }
}

/**
 * Loads `assetId` and returns its `AssetCriteria` only when `viewer` owns it
 * (or moderates the market) — the `isOwner(...) || canModerate(...)` idiom
 * `getAssetRequestQueue` (`@/server/queries/assets`) already uses for the
 * identical question ("may this viewer see something scoped to this listing
 * that is not public"). Returns `null` for a missing asset and for one the
 * caller does not own alike: `listBuyers`/`getBuyerDetail` must not let one
 * seller learn how a buyer scores against a competitor's listing, and must
 * not distinguish "no such listing" from "not yours" in a way that would
 * confirm the id exists.
 */
async function loadOwnedAssetCriteria(
  assetId: string,
  viewer: MaybeViewer,
): Promise<AssetCriteria | null> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      sellerProfileId: true,
      status: true,
      category: true,
      country: true,
      licenceType: true,
      businessStatus: true,
      askingPriceCents: true,
      sellerProfile: { select: { user: { select: { status: true } } } },
    },
  })
  if (!asset) return null

  const ref: AssetRef = {
    id: assetId,
    sellerProfileId: asset.sellerProfileId,
    status: asset.status,
    ownerStatus: asset.sellerProfile.user.status,
  }
  if (!isOwner(viewer, ref) && !canModerate(viewer)) return null

  return {
    category: asset.category,
    country: asset.country,
    licenceType: asset.licenceType,
    businessStatus: asset.businessStatus,
    askingPriceCents: Number(asset.askingPriceCents),
  }
}

/**
 * The seller/manager-only buyer directory (ruling 1, Task 17): a buyer
 * calling this gets `{ items: [], total: 0, scoredAssetId: null }`, never a
 * 403 and never a peek at who else is shopping the market — the same
 * "refuse by returning nothing, not by erroring" shape `getAssetRequestQueue`
 * uses. Always filtered to active buyer accounts (`BUYER_VISIBILITY_FLOOR`,
 * `@/server/queries/buyer-where`).
 *
 * Without `forAssetId`, buyers are sorted newest-first. With it (and only
 * once `loadOwnedAssetCriteria` confirms the caller owns that listing),
 * every returned buyer is scored with `scoreMatch` and sorted by score
 * descending, ties broken by `specificity` descending, then `createdAt`
 * descending (ruling 3) — a buyer who scored 100 because their mandate
 * constrains all five criteria is a genuinely better lead than one who
 * scored 100 because it constrains nothing, and this ordering is what makes
 * that visible without the seller having to guess. `id` ascending is the
 * final tie-break in both orderings (`compareBuyersByRecency`/
 * `compareBuyersByScore`, `@/server/queries/buyer-where`) so the sort is a
 * total order — without it, two buyers tied on every earlier key would have
 * no defined relative order, and a paginated read across such a boundary
 * could duplicate or drop a row.
 *
 * Like `countMandateMatches` (`@/server/actions/profile`, Task 16), this
 * scores every matching row in memory rather than pushing the ranking into
 * SQL: with 12 seeded buyers (and no more expected at this prototype's scale)
 * that is correct and simple. A real deployment would move this to a filtered
 * query plus a background-computed score, exactly as Task 18's own README
 * note for `getRecommendedAssets` says for the mirror-image query.
 *
 * `listAssets`'s facet counts are **not** another example of this, though an
 * earlier version of this comment cited them as one: those are a
 * `prisma.asset.groupBy`, computed in the database. The distinction is the
 * whole point of the paragraph — a count over a fixed set of buckets is
 * expressible in SQL, a per-row score against a weighted rubric is not
 * expressible in this app's SQL without materialising it, which is why one
 * moved into the query and the other did not.
 */
export async function listBuyers(
  filters: BuyerFilters,
  viewer: MaybeViewer,
  forAssetId?: string,
): Promise<ListBuyersResult> {
  if (!canBrowseBuyers(viewer)) {
    return { items: [], total: 0, scoredAssetId: null }
  }

  const where = buildBuyerWhere(filters)
  const [rows, asset] = await Promise.all([
    prisma.buyerProfile.findMany({
      where,
      // Deterministic so the pre-sort read itself is stable — see the doc
      // comment on `BUYER_SORT_ORDER` (`@/server/queries/buyer-where`).
      orderBy: BUYER_SORT_ORDER,
      select: {
        id: true,
        displayName: true,
        buyerType: true,
        country: true,
        verified: true,
        createdAt: true,
        mandate: { select: MANDATE_SELECT },
      },
    }),
    forAssetId ? loadOwnedAssetCriteria(forAssetId, viewer) : Promise.resolve(null),
  ])

  const total = rows.length

  const entries = rows.map((row) => {
    const criteria = toMandateCriteria(row.mandate)
    return {
      id: row.id,
      createdAt: row.createdAt,
      row,
      criteria,
      specificity: mandateSpecificity(criteria),
    }
  })

  // Both branches sort with a total order — `compareBuyersByScore` falls
  // through to `compareBuyersByRecency`'s own `id`-ascending tail, so no two
  // distinct buyers can ever compare equal (`@/server/queries/buyer-where`).
  const ordered =
    asset !== null
      ? entries
          .map((entry) => {
            const match = scoreMatch(entry.criteria, asset)
            return { ...entry, match, score: match.score }
          })
          .sort(compareBuyersByScore)
      : entries.map((entry) => ({ ...entry, match: null })).sort(compareBuyersByRecency)

  const start = (filters.page - 1) * PAGE_SIZE
  const page = ordered.slice(start, start + PAGE_SIZE)

  const items: BuyerListItem[] = page.map(({ row, criteria, specificity, match }) => ({
    id: row.id,
    displayName: row.displayName,
    buyerType: row.buyerType,
    country: row.country,
    verified: row.verified,
    createdAt: row.createdAt,
    mandate: { ...criteria, specificity },
    match,
  }))

  return {
    items,
    total,
    scoredAssetId: asset !== null && forAssetId ? forAssetId : null,
  }
}

/**
 * The buyer profile and full mandate for `/buyers/[id]`, restricted the same
 * way as `listBuyers` (ruling 1 extends naturally to the detail page: a
 * buyer must not reach another buyer's full mandate just by guessing an id).
 * Returns `null` for anyone `canBrowseBuyers` refuses, for a buyer whose
 * account is not active, and for an id that does not exist — a 404 either
 * way, never a 403 that would confirm a suspended buyer's profile is there,
 * mirroring `getAssetDetail`'s identical "hidden and non-existent look the
 * same" rule.
 *
 * `forAssetId` is optional so `getBuyerDetail(id, viewer)` alone (the shape
 * Task 18/19 are expected to call) keeps working: when supplied, the same
 * ownership-checked `loadOwnedAssetCriteria` this file's `listBuyers` uses
 * decides whether a match breakdown is computed, so the two entry points
 * share one ownership check rather than two.
 */
export async function getBuyerDetail(
  id: string,
  viewer: MaybeViewer,
  forAssetId?: string,
): Promise<BuyerDetail | null> {
  if (!canBrowseBuyers(viewer)) return null

  const row = await prisma.buyerProfile.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      buyerType: true,
      country: true,
      bio: true,
      websiteUrl: true,
      verified: true,
      createdAt: true,
      userId: true,
      user: { select: { status: true } },
      mandate: { select: MANDATE_SELECT },
    },
  })
  if (!row || row.user.status !== 'ACTIVE') return null

  const criteria = toMandateCriteria(row.mandate)
  const asset = forAssetId ? await loadOwnedAssetCriteria(forAssetId, viewer) : null

  return {
    id: row.id,
    displayName: row.displayName,
    buyerType: row.buyerType,
    country: row.country,
    bio: row.bio,
    websiteUrl: row.websiteUrl,
    verified: row.verified,
    createdAt: row.createdAt,
    mandate: { ...criteria, specificity: mandateSpecificity(criteria) },
    match: asset !== null ? scoreMatch(criteria, asset) : null,
    scoredAssetId: asset !== null && forAssetId ? forAssetId : null,
    canContact: contactAvailability(
      viewer,
      { userId: row.userId, status: row.user.status },
      // Contacting a buyer puts the viewer on the seller side of the thread.
      'SELLER',
    ),
  }
}

// ---------------------------------------------------------------------------
// Task 18 — the buyer's own dashboard
// ---------------------------------------------------------------------------

/** One of the buyer's own access requests, as their dashboard shows it. */
export interface BuyerRequestSummary {
  id: string
  assetId: string
  assetPublicRef: string
  assetTeaserTitle: string
  status: AccessStatus
  requestedAt: Date
  decidedAt: Date | null
}

/** The requests in one `AccessStatus`, in the order the dashboard renders them. */
export interface BuyerRequestGroup {
  status: AccessStatus
  requests: BuyerRequestSummary[]
}

export interface BuyerOverview {
  /**
   * The viewer's own mandate, carrying `specificity` for the same reason
   * every other `BuyerMandateSummary` in this module does — the dashboard
   * must not present a ranking built from a mandate that constrains nothing
   * (`isMandateRankable`, `@/lib/matching`), and it reads that number from
   * here rather than recomputing it.
   */
  mandate: BuyerMandateSummary
  requestGroups: BuyerRequestGroup[]
  requestCount: number
  unreadMessageCount: number
}

/** What a buyer whose profile row cannot be found sees: a vacuous mandate and nothing else. */
function emptyBuyerOverview(): BuyerOverview {
  const criteria = toMandateCriteria(null)
  return {
    mandate: { ...criteria, specificity: mandateSpecificity(criteria) },
    requestGroups: [],
    requestCount: 0,
    unreadMessageCount: 0,
  }
}

/**
 * Everything the buyer dashboard shows about the buyer themselves: their
 * mandate, their access requests grouped by status, and how many messages are
 * waiting for them. The listings half of that page comes from
 * `getRecommendedAssets` (`@/server/queries/assets`), which is where the
 * asset visibility floor and the asset DTO already live.
 *
 * Takes a `buyerProfileId` and no viewer, deliberately: every caller reaches
 * it with `viewer.buyerProfileId` — an id derived from the session by
 * `getViewer` (`@/server/session`), never from a URL or a form — so there is
 * no "may this viewer see this buyer" question left for the query to ask. A
 * `buyerProfileId` that matches no row returns the empty overview rather than
 * throwing, the same "refuse by returning nothing" shape `listBuyers` above
 * and `getAssetRequestQueue` (`@/server/queries/assets`) use.
 *
 * The unread count is "messages in my conversations that someone else sent
 * and nobody has marked read". Excluding the buyer's own messages matters:
 * `Message.readAt` is null on every message from the moment it is sent,
 * including the ones this buyer just wrote, so counting the column alone
 * would tell a buyer they have unread mail every time they send some.
 *
 * Task 19 moved that clause into `unreadForViewerWhere`
 * (`@/server/queries/conversation-where`) so this total, the seller's
 * mirror of it, the per-thread dots on `/inbox` and the `where` `markRead`
 * clears with are one definition rather than five. This number must equal
 * the sum of the per-thread counts, or the dashboard and the inbox
 * contradict each other on the same screen.
 */
export async function getBuyerOverview(buyerProfileId: string): Promise<BuyerOverview> {
  const profile = await prisma.buyerProfile.findUnique({
    where: { id: buyerProfileId },
    select: { userId: true, mandate: { select: MANDATE_SELECT } },
  })
  if (!profile) return emptyBuyerOverview()

  const [requestRows, unreadMessageCount] = await prisma.$transaction([
    prisma.accessRequest.findMany({
      where: { buyerProfileId },
      // Newest ask first within each status group, `id` ascending as the
      // total-order tail — the same reason `BUYER_SORT_ORDER` above carries
      // one. `groupByOrder` preserves this order inside every group.
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        requestedAt: true,
        decidedAt: true,
        asset: { select: { id: true, publicRef: true, teaserTitle: true } },
      },
    }),
    prisma.message.count({
      where: { conversation: { buyerProfileId }, ...unreadForViewerWhere(profile.userId) },
    }),
  ])

  const requests: BuyerRequestSummary[] = requestRows.map((row) => ({
    id: row.id,
    assetId: row.asset.id,
    assetPublicRef: row.asset.publicRef,
    assetTeaserTitle: row.asset.teaserTitle,
    status: row.status,
    requestedAt: row.requestedAt,
    decidedAt: row.decidedAt,
  }))

  const criteria = toMandateCriteria(profile.mandate)

  return {
    mandate: { ...criteria, specificity: mandateSpecificity(criteria) },
    requestGroups: groupByOrder(
      requests,
      (request) => request.status,
      BUYER_ACCESS_STATUS_ORDER,
    ).map(({ key, items }) => ({ status: key, requests: items })),
    requestCount: requests.length,
    unreadMessageCount,
  }
}
