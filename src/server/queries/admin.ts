import type {
  AssetCategory,
  AssetStatus,
  ModAction,
  ModTargetType,
  Prisma,
  Role,
  UserStatus,
} from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import type { MaybeViewer } from '@/lib/authz'
import type { AdminFilters } from '@/lib/filters/admin-filters'
import {
  assertCanModerate,
  buildAdminAssetWhere,
  buildParticipantWhere,
  compareAdminAssets,
  compareParticipants,
  MODERATION_LOG_LIMIT,
} from './admin-where'

/**
 * The manager console's reads. Three tables and one badge count, and the only
 * place in this application where a query has **no visibility floor**: the
 * participants list returns `SUSPENDED` and `REMOVED` accounts, the listings
 * list returns drafts, rejections and the listings of suspended sellers, and
 * neither hides a seller's `companyName`. That is the console's whole purpose
 * — a manager cannot reinstate an account they cannot see, or review a
 * pending listing that the catalog's floor hides from them.
 *
 * Which makes the authorization guard the load-bearing line in this file, so
 * it is stated once, as a throw, and is the first statement of every function
 * below. **Every function here throws `FORBIDDEN` rather than returning an
 * empty result**, which deliberately differs from `listBuyers`
 * (`@/server/queries/buyers`) and `getAssetRequestQueue`
 * (`@/server/queries/assets`): a buyer may legitimately land on `/buyers` and
 * needs a sensible empty state, whereas nothing but a manager should ever get
 * an `/admin` page at all. An admin query that answered a non-manager with an
 * empty result would let a future careless caller ship a *blank console* —
 * something that looks like a working admin surface, with nothing in it —
 * instead of an error. The full reasoning, and the four viewer shapes the
 * guard is tested against, are on `assertCanModerate`
 * (`@/server/queries/admin-where`); the `/admin` page's own independent
 * `notFound()` is what a browser actually sees.
 *
 * **Neither table paginates**, and both are ordered in memory. The orders
 * that matter here — the review queue first, then the accounts a manager
 * might act on — are rankings over enum members, which Postgres sorts by
 * declaration order and Prisma cannot express as an `orderBy` without raw
 * SQL. Sorting in memory is only correct because the read is unpaginated: a
 * `take`/`skip` read re-sorted afterwards would drop and duplicate rows
 * across pages, which is the exact hazard `listConversations`
 * (`@/server/queries/conversations`) documents for its own two-stage sort. At
 * this prototype's scale (19 accounts, 40 listings) reading everything is the
 * right trade; past it, the honest fix is a raw-SQL `CASE` ordering plus real
 * pagination, not an in-memory sort of a page.
 */

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

/**
 * What each side of the market has actually done — the "activity counts" the
 * console shows per row, and the numbers the suspension dialog turns into a
 * plain-language consequence ("their 4 listings will be hidden from the
 * catalog immediately").
 *
 * Counts are carried for both sides on every row rather than being
 * discriminated by role, because a `User` may in principle hold both profile
 * rows (the schema permits it; no seeded account does), and a table cell that
 * is `0` reads correctly for an account with no such profile at all.
 */
export interface ParticipantActivity {
  /** Listings this account owns, in every status. */
  listingCount: number
  /**
   * How many of those hold `status: 'PUBLISHED'` — the ones a suspension
   * takes off the catalog, and the ones a reinstatement puts back.
   *
   * **This is one half of the catalog's visibility floor, not the whole of
   * it.** `VISIBILITY_FLOOR` (`@/server/queries/asset-where`) requires
   * `status: 'PUBLISHED'` *and* an `ACTIVE` owner, so for an account that is
   * itself `SUSPENDED` or `REMOVED` this number counts listings that are not
   * in the catalog at all. Deliberately so, because it is exactly the number
   * both callers want: the suspension and reinstatement dialogs ask "how many
   * listings does this leave or re-enter the catalog", which is this count in
   * both directions. It is the *participants row* that has to qualify it,
   * and does (`activity.publishedHidden`,
   * `@/components/domain/participant-table`) — narrowing the count here would
   * fix one caller by breaking two.
   */
  publishedListingCount: number
  /** Access requests this account has filed, in every status. */
  requestCount: number
}

export interface ParticipantRow {
  userId: string
  email: string
  role: Role
  status: UserStatus
  /**
   * `BuyerProfile.displayName` or `SellerProfile.companyName` — whichever
   * this account has. `null` for a `MANAGER`, who holds neither profile row
   * and whose only name is their email.
   */
  displayName: string | null
  /** The profile's own verification flag; `null` when there is no profile row. */
  verified: boolean | null
  /** The profile's country; `null` for the same reason as `verified`. */
  country: string | null
  createdAt: Date
  activity: ParticipantActivity
}

/**
 * Every account on the marketplace, filtered by role, status and a text
 * search over email and display name, ordered by `compareParticipants`
 * (`@/server/queries/admin-where`).
 *
 * The two activity counts come from `groupBy` aggregates over the whole
 * `Asset` and `AccessRequest` tables rather than from per-row `_count`
 * selects: one aggregate answers the question for every account at once,
 * where a filtered relation count would be a correlated subquery per row.
 * The aggregates deliberately ignore the participant filter — they are keyed
 * by profile id and read as a lookup table, so filtering them would save
 * nothing and would have to be kept in sync with the row filter.
 *
 * Both aggregates and the row read run in one `$transaction`, so the counts
 * cannot describe a different instant from the rows they are printed beside.
 */
export async function listParticipants(
  filters: AdminFilters,
  viewer: MaybeViewer,
): Promise<ParticipantRow[]> {
  assertCanModerate(viewer)

  // `satisfies` rather than passing the literal straight to `groupBy`, for
  // the reason `listAssets` (`@/server/queries/assets`) documents: Prisma's
  // inference otherwise widens `_count: true` against the broader
  // `…CountAggregateInputType | boolean` union and every row's `_count` comes
  // back typed as that union instead of the `number` the literal produces.
  const listingCountArgs = {
    by: ['sellerProfileId', 'status'],
    _count: true,
  } satisfies Prisma.AssetGroupByArgs

  const requestCountArgs = {
    by: ['buyerProfileId'],
    _count: true,
  } satisfies Prisma.AccessRequestGroupByArgs

  const [userRows, listingCounts, requestCounts] = await prisma.$transaction([
    prisma.user.findMany({
      where: buildParticipantWhere(filters),
      // A deterministic read order even though `compareParticipants` re-sorts
      // below — the same discipline `BUYER_SORT_ORDER`
      // (`@/server/queries/buyer-where`) applies for its own in-memory sort.
      orderBy: [{ email: 'asc' }],
      // `select`, not `include`: this row carries an account's identity and
      // there is no reason for `passwordHash` to travel to the console, the
      // same reasoning `getViewer` (`@/server/session`) documents.
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        buyerProfile: { select: { id: true, displayName: true, country: true, verified: true } },
        sellerProfile: { select: { id: true, companyName: true, country: true, verified: true } },
      },
    }),
    prisma.asset.groupBy(listingCountArgs),
    prisma.accessRequest.groupBy(requestCountArgs),
  ])

  const listingsBySeller = new Map<string, { total: number; published: number }>()
  for (const row of listingCounts) {
    const entry = listingsBySeller.get(row.sellerProfileId) ?? { total: 0, published: 0 }
    entry.total += row._count
    if (row.status === 'PUBLISHED') entry.published += row._count
    listingsBySeller.set(row.sellerProfileId, entry)
  }

  const requestsByBuyer = new Map<string, number>()
  for (const row of requestCounts) {
    requestsByBuyer.set(row.buyerProfileId, row._count)
  }

  const rows: ParticipantRow[] = userRows.map((user) => {
    const listings = user.sellerProfile
      ? (listingsBySeller.get(user.sellerProfile.id) ?? { total: 0, published: 0 })
      : { total: 0, published: 0 }
    const profile = user.buyerProfile ?? user.sellerProfile ?? null

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      displayName: user.buyerProfile?.displayName ?? user.sellerProfile?.companyName ?? null,
      verified: profile?.verified ?? null,
      country: profile?.country ?? null,
      createdAt: user.createdAt,
      activity: {
        listingCount: listings.total,
        publishedListingCount: listings.published,
        requestCount: user.buyerProfile
          ? (requestsByBuyer.get(user.buyerProfile.id) ?? 0)
          : 0,
      },
    }
  })

  return rows.sort(compareParticipants)
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export interface AdminAssetRow {
  id: string
  publicRef: string
  teaserTitle: string
  status: AssetStatus
  category: AssetCategory
  country: string
  askingPriceCents: number
  sellerCompanyName: string
  /** The owning seller's account status — a suspended owner hides their listings from the catalog. */
  sellerUserStatus: UserStatus
  publishedAt: Date | null
  updatedAt: Date
  /** Set by `moderateListing`; the seller reads it on their own dashboard. */
  rejectionReason: string | null
  viewCount: number
}

/**
 * Every listing in every status, filtered by the status checkboxes and
 * ordered by `compareAdminAssets` (`@/server/queries/admin-where`), which
 * puts the `PENDING_REVIEW` queue first.
 *
 * The seller's `companyName` is returned unredacted, which no other list
 * query in this app does. It is not a widening: `canViewFullAsset`
 * (`@/lib/authz`) already returns `true` for a manager on every listing, so
 * the console shows what a manager could already read on any listing's detail
 * page — with the guard above being what keeps that true for this query too.
 * The confidential *financial* columns are deliberately still not selected:
 * a moderation decision is made on the teaser and the seller's identity, and
 * a column that is never read cannot leak.
 */
export async function listAllAssets(
  filters: AdminFilters,
  viewer: MaybeViewer,
): Promise<AdminAssetRow[]> {
  assertCanModerate(viewer)

  const rows = await prisma.asset.findMany({
    where: buildAdminAssetWhere(filters),
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      publicRef: true,
      teaserTitle: true,
      status: true,
      category: true,
      country: true,
      askingPriceCents: true,
      publishedAt: true,
      updatedAt: true,
      rejectionReason: true,
      viewCount: true,
      sellerProfile: {
        select: { companyName: true, user: { select: { status: true } } },
      },
    },
  })

  return rows
    .map((row) => ({
      id: row.id,
      publicRef: row.publicRef,
      teaserTitle: row.teaserTitle,
      status: row.status,
      category: row.category,
      country: row.country,
      // `bigint` → `number` at the read: these are hand-built
      // summary rows, not `AssetDto`s, so nothing downstream narrows them.
      askingPriceCents: Number(row.askingPriceCents),
      sellerCompanyName: row.sellerProfile.companyName,
      sellerUserStatus: row.sellerProfile.user.status,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      rejectionReason: row.rejectionReason,
      viewCount: row.viewCount,
    }))
    .sort(compareAdminAssets)
}

/**
 * How many listings are waiting on a manager right now.
 *
 * A fourth read beyond the brief's three, and it earns its place: the review
 * queue is the one thing on this console that is *owed* rather than merely
 * available, and a manager who opens the participants tab would otherwise
 * have no way to know two listings have been waiting a week. It renders as a
 * badge on the listings tab from every tab, so it cannot be folded into
 * `listAllAssets` — that query only runs when its own tab is open.
 */
export async function countListingsAwaitingReview(viewer: MaybeViewer): Promise<number> {
  assertCanModerate(viewer)
  return prisma.asset.count({ where: { status: 'PENDING_REVIEW' } })
}

// ---------------------------------------------------------------------------
// Moderation log
// ---------------------------------------------------------------------------

export interface ModerationLogRow {
  id: string
  actorEmail: string
  action: ModAction
  targetType: ModTargetType
  targetId: string
  /**
   * What the target is called: the account's email, or the listing's
   * `publicRef`. `ModerationLog` stores only a raw id (it has no foreign key
   * — the row must outlive whatever it describes), so this is resolved at
   * read time and falls back to the id itself when the target is gone.
   */
  targetLabel: string
  reason: string
  createdAt: Date
}

export interface ModerationLogResult {
  items: ModerationLogRow[]
  /** True when older entries exist beyond `MODERATION_LOG_LIMIT`; the tab says so on screen. */
  truncated: boolean
}

/**
 * The audit trail, newest first — design decision D4's whole point: every
 * status change this console makes is written here in the same transaction as
 * the change itself, so there is no such thing as an unlogged moderation.
 *
 * Reading `MODERATION_LOG_LIMIT + 1` rows is how `truncated` is answered
 * exactly rather than by guessing from a full page: if the extra row comes
 * back, there is more history, and it is dropped before returning. A second
 * `count()` would answer the same question with a second scan of a
 * monotonically growing table.
 *
 * Target labels are resolved in two batched reads keyed by the ids actually
 * present, not by joining — `ModerationLog.targetId` is a bare string with no
 * foreign key behind it, deliberately, so that a log row survives whatever it
 * describes. An id that no longer resolves renders as itself rather than
 * disappearing.
 */
export async function listModerationLog(viewer: MaybeViewer): Promise<ModerationLogResult> {
  assertCanModerate(viewer)

  const rows = await prisma.moderationLog.findMany({
    // `id` descending as the tie-break: cuids are monotonic within a
    // millisecond, and two rows written in the same transaction can share a
    // `createdAt` to the microsecond. Without it their relative order is
    // whatever Postgres returns.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MODERATION_LOG_LIMIT + 1,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      reason: true,
      createdAt: true,
      actor: { select: { email: true } },
    },
  })

  const truncated = rows.length > MODERATION_LOG_LIMIT
  const page = truncated ? rows.slice(0, MODERATION_LOG_LIMIT) : rows

  const userIds = page.filter((row) => row.targetType === 'USER').map((row) => row.targetId)
  const assetIds = page.filter((row) => row.targetType === 'ASSET').map((row) => row.targetId)

  const [users, assets] = await prisma.$transaction([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } }),
    prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, publicRef: true } }),
  ])

  const labels = new Map<string, string>()
  for (const user of users) labels.set(user.id, user.email)
  for (const asset of assets) labels.set(asset.id, asset.publicRef)

  return {
    items: page.map((row) => ({
      id: row.id,
      actorEmail: row.actor.email,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      targetLabel: labels.get(row.targetId) ?? row.targetId,
      reason: row.reason,
      createdAt: row.createdAt,
    })),
    truncated,
  }
}
