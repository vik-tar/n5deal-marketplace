import type { AssetStatus, Prisma, UserStatus } from '@/generated/prisma/client'
import { canModerate, type MaybeViewer } from '@/lib/authz'
import type { AdminFilters } from '@/lib/filters/admin-filters'

/**
 * Pure query-shape, ordering and transition logic for the manager console,
 * kept out of `admin.ts` for the reason `asset-where.ts`, `buyer-where.ts`
 * and `conversation-where.ts` each document at length: this module imports
 * only *types* from the generated Prisma client (`import type`, erased at
 * compile time) and never `@/server/db`, which constructs a client eagerly at
 * module load and fails fast without `DATABASE_URL`. Everything here is
 * therefore testable as ordinary pure logic, with no database, no connection
 * string and no environment.
 *
 * It carries more than the other three do — the authorization guard and the
 * legal status transitions as well as the where-clauses — because those are
 * exactly the rules of this feature that can fail, and a rule that can fail
 * and cannot be tested is the shape this codebase has twice found a
 * decorative guard hiding in (`listAssets`' per-row `canViewAsset`, Task 12;
 * `decideAccess`' `P2002` catch, Task 14).
 */

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

/**
 * The console's authorization gate, as a throw.
 *
 * **This deliberately differs from `listBuyers` (`@/server/queries/buyers`)
 * and `getAssetRequestQueue` (`@/server/queries/assets`)**, which refuse an
 * ineligible caller by returning nothing. That difference is the point. A
 * buyer may legitimately navigate to `/buyers` and needs a sensible empty
 * state there; nothing but a manager should ever get an `/admin` page at all,
 * and an admin query that answered a non-manager with an empty result would
 * let a future careless caller ship a *blank console* — a page that looks
 * like a working admin surface with nothing in it — instead of an error.
 * Refusing loudly here means the only way to render this data is to have
 * passed the check.
 *
 * Unlike the per-row `canViewAsset` check this codebase removed from
 * `listAssets` (Task 12), this guard **can** fail: `canModerate` is called
 * with the real viewer, not a hardcoded stand-in, and every non-manager
 * viewer shape reaches the throw. `tests/unit/queries/admin-where.test.ts`
 * exercises all four of them — anonymous, buyer, seller, and a `MANAGER`
 * whose own account is no longer `ACTIVE`, which `canModerate` refuses
 * through `isActive`.
 *
 * The `/admin` page itself checks `canModerate` independently and calls
 * `notFound()`, so a non-manager sees a 404 rather than this error: the two
 * are not redundant, they answer different questions. The page decides what a
 * browser is shown; this decides whether the data may be assembled at all,
 * for any caller, including one written later that forgets the page check.
 */
export function assertCanModerate(viewer: MaybeViewer): void {
  if (!canModerate(viewer)) throw new Error('FORBIDDEN')
}

// ---------------------------------------------------------------------------
// Where clauses
// ---------------------------------------------------------------------------

/**
 * The participants table's filter.
 *
 * **There is no visibility floor here, and that is deliberate.** Every other
 * list query in this app spreads one unconditionally (`VISIBILITY_FLOOR`,
 * `BUYER_VISIBILITY_FLOOR`); this one must show `SUSPENDED` and `REMOVED`
 * accounts, because reinstating a suspended seller is the console's job and
 * a manager cannot reinstate an account they cannot see. `assertCanModerate`
 * above is what makes that safe — the absence of a floor is load-bearing, not
 * an omission, and it is the reason the guard throws instead of returning
 * empty.
 *
 * `q` searches the account's email and whichever display name it has: a
 * `BuyerProfile.displayName` or a `SellerProfile.companyName`. A `MANAGER`
 * holds neither profile row, so a manager is findable by email only — which
 * is the only name they have.
 */
export function buildParticipantWhere(filters: AdminFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {}

  if (filters.roles.length > 0) {
    where.role = { in: filters.roles }
  }
  if (filters.userStatuses.length > 0) {
    where.status = { in: filters.userStatuses }
  }
  if (filters.q !== '') {
    where.OR = [
      { email: { contains: filters.q, mode: 'insensitive' } },
      { buyerProfile: { displayName: { contains: filters.q, mode: 'insensitive' } } },
      { sellerProfile: { companyName: { contains: filters.q, mode: 'insensitive' } } },
    ]
  }

  return where
}

/**
 * The listings table's filter — the status checkboxes and nothing else.
 *
 * Also floor-free, for the same reason and with the same guard behind it:
 * this is the only query in the application that returns a `DRAFT` listing,
 * a `REJECTED` one, or a listing belonging to a suspended seller. An empty
 * `assetStatuses` means every status, so the default view is the whole
 * marketplace.
 */
export function buildAdminAssetWhere(filters: AdminFilters): Prisma.AssetWhereInput {
  if (filters.assetStatuses.length === 0) return {}
  return { status: { in: filters.assetStatuses } }
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * The order the listings tab renders in: the review queue first, then the
 * decisions a manager might reverse, then the market, then everything that is
 * nobody's action item.
 *
 * `PENDING_REVIEW` leads because it is the queue this console exists to work
 * — the brief's "review queue surfaced first". `SUSPENDED` follows: it is a
 * manager's own standing intervention and the one listing state they might
 * revisit. `PUBLISHED` is the live catalog, `REJECTED` is in the seller's
 * court (they must fix and resubmit), `DRAFT` was never submitted so there is
 * nothing to moderate, and `SOLD` is terminal.
 *
 * Exhaustive over `AssetStatus` by construction, exactly as
 * `SELLER_STATUS_ORDER` (`@/server/queries/asset-where`) is: `satisfies`
 * makes a new enum member a type error here rather than a status that
 * silently sorts to the end.
 */
export const ADMIN_ASSET_STATUS_ORDER = [
  'PENDING_REVIEW',
  'SUSPENDED',
  'PUBLISHED',
  'REJECTED',
  'DRAFT',
  'SOLD',
] as const satisfies readonly AssetStatus[]

/**
 * The participants tab's order, on the same "what might a manager need to act
 * on" principle: `SUSPENDED` first because a suspension is a live, reversible
 * decision and reinstating is a real workflow; `ACTIVE` next as the market
 * itself; `REMOVED` last as history.
 */
export const ADMIN_USER_STATUS_ORDER = [
  'SUSPENDED',
  'ACTIVE',
  'REMOVED',
] as const satisfies readonly UserStatus[]

function rankOf<T extends string>(order: readonly T[], value: T): number {
  const index = order.indexOf(value)
  // A status not named in the order sorts after every one that is, rather
  // than silently ahead of them at index -1 — the same "never lose a row"
  // instinct `groupByOrder` (`@/lib/group`) documents for its own leftovers.
  // Unreachable today: both orders are exhaustive by `satisfies`.
  return index === -1 ? order.length : index
}

/** The minimum shape `compareAdminAssets` needs to place a listing. */
export interface AdminAssetSortKey {
  id: string
  status: AssetStatus
  updatedAt: Date
}

/**
 * Listings order: `ADMIN_ASSET_STATUS_ORDER`, then most recently changed
 * first, then `id` ascending so the sort is total and the table cannot
 * reshuffle between renders.
 *
 * `updatedAt` rather than `createdAt`: what a moderator is scanning for is
 * what *moved*. A three-month-old draft that was edited and submitted this
 * morning is the most urgent row on the page, and `createdAt` would bury it
 * under listings drafted last week and never touched since.
 *
 * FIFO within `PENDING_REVIEW` — the fairness rule `compareRequestQueues`
 * (`@/server/queries/asset-where`) applies to access requests — was
 * considered and rejected twice over. There is no `submittedAt` column, so
 * "oldest first" would rank by draft age rather than by how long the seller
 * has actually been waiting; and giving one status the opposite sort
 * direction from the other five is a rule a reader cannot predict from the
 * table in front of them. If waiting time ever needs to be fair here, the
 * honest fix is a `submittedAt` column, not a per-status comparator.
 */
export function compareAdminAssets(a: AdminAssetSortKey, b: AdminAssetSortKey): number {
  const byStatus =
    rankOf(ADMIN_ASSET_STATUS_ORDER, a.status) - rankOf(ADMIN_ASSET_STATUS_ORDER, b.status)
  if (byStatus !== 0) return byStatus
  const byRecency = b.updatedAt.getTime() - a.updatedAt.getTime()
  if (byRecency !== 0) return byRecency
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The minimum shape `compareParticipants` needs to place an account. `userId`
 * rather than `id` because that is what a `ParticipantRow`
 * (`@/server/queries/admin`) calls it — the row is an account, not a profile,
 * and naming the field twice differently is how a sort key ends up compared
 * against the wrong column.
 */
export interface ParticipantSortKey {
  userId: string
  status: UserStatus
  email: string
}

/**
 * Participants order: `ADMIN_USER_STATUS_ORDER`, then email ascending, then
 * `id` ascending.
 *
 * Email rather than a recency key, because this table is read by *looking
 * for someone*: a manager arrives knowing an address or a company name, and
 * an alphabetical list is scannable in a way a chronological one is not. The
 * emails are unique, so `userId` is only ever a defensive tail — kept anyway,
 * because every comparator in this codebase ends in one and a total order
 * should not depend on a uniqueness constraint held elsewhere.
 *
 * `localeCompare` is deliberately not used: it is locale-sensitive, and the
 * order of an audit table should not change with the reader's language.
 */
export function compareParticipants(a: ParticipantSortKey, b: ParticipantSortKey): number {
  const byStatus =
    rankOf(ADMIN_USER_STATUS_ORDER, a.status) - rankOf(ADMIN_USER_STATUS_ORDER, b.status)
  if (byStatus !== 0) return byStatus
  if (a.email !== b.email) return a.email < b.email ? -1 : 1
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
}

/**
 * How many `ModerationLog` rows the log tab reads.
 *
 * The table grows forever and nothing prunes it, so an unbounded read is a
 * query that gets slower every time anybody moderates anything. Two hundred
 * is far past the horizon of a prototype whose seed carries two rows, and the
 * tab states the cap on screen rather than silently truncating — the same
 * honesty the catalog's own "showing N of M" line applies to pagination.
 */
export const MODERATION_LOG_LIMIT = 200

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * The three account-level moderation actions, named as the client sends them.
 * They map onto `ModAction`'s own `SUSPEND`/`REINSTATE`/`REMOVE` members
 * one-for-one, so the log row's `action` is the input, not a translation of
 * it.
 */
export type UserModerationAction = 'SUSPEND' | 'REINSTATE' | 'REMOVE'

/** The three listing-level decisions, in the vocabulary the console's buttons use. */
export type ListingModerationAction = 'APPROVE' | 'REJECT' | 'SUSPEND'

/**
 * A legal status transition: which statuses it may be applied *from*, and the
 * status it produces.
 *
 * `from` is a list rather than a single status because it is handed straight
 * to the conditional `updateMany` in `@/server/actions/moderation` — the
 * write is conditioned on the exact set of statuses validated here, not just
 * on the row's id, so a row a concurrent action already moved matches zero
 * rows instead of being silently overwritten. That is the pattern
 * `decideAccess` (`@/server/actions/access-requests`) established and every
 * mutation in this codebase has followed since.
 */
export interface StatusTransition<S extends string> {
  from: readonly S[]
  to: S
}

/**
 * `REINSTATE` accepts `REMOVED` as well as `SUSPENDED`, which is the one
 * transition here the brief does not spell out.
 *
 * `removeUser` is a *soft* delete — the brief's own word — and the whole
 * argument for a soft delete is that the row survives so the counterparty's
 * conversations and access requests stay coherent. A soft delete that cannot
 * be undone has the irreversibility of a hard delete without the tidiness,
 * and one stray click on a row would then be permanent for an account whose
 * data is all still sitting there. Since a manager cannot remove themselves
 * (`canModerateUser`, `@/lib/authz`), the account that can undo it always
 * exists. The log records both the removal and the reinstatement, so nothing
 * about the reversal is invisible.
 *
 * `SUSPEND` is not offered on a `REMOVED` account: it would be a downgrade of
 * an already-terminal state and would leave `/suspended` explaining a
 * suspension to somebody `getViewer` (`@/server/session`) has already
 * collapsed to `null`.
 */
export const USER_TRANSITIONS: Record<UserModerationAction, StatusTransition<UserStatus>> = {
  SUSPEND: { from: ['ACTIVE'], to: 'SUSPENDED' },
  REINSTATE: { from: ['SUSPENDED', 'REMOVED'], to: 'ACTIVE' },
  REMOVE: { from: ['ACTIVE', 'SUSPENDED'], to: 'REMOVED' },
}

/**
 * `REJECT` is legal only out of `PENDING_REVIEW` — the queue is the only
 * place a listing waits to be sent back to its seller. `SUSPEND` is legal
 * only out of `PUBLISHED`: taking a listing off the catalog is the whole
 * action, and there is nothing to take down from `DRAFT`, `REJECTED` or
 * `SOLD`. `APPROVE` accepts `PENDING_REVIEW` **and `SUSPENDED`**, which is
 * the one transition here the brief does not spell out.
 *
 * **`SUSPENDED` → `PUBLISHED` exists for the same reason `REINSTATE` accepts
 * `REMOVED` above, and the symmetry is the point.** Nothing else in the
 * application can move a suspended listing: `REJECT` does not accept it,
 * `submitForReview` (`@/server/actions/assets`) accepts `DRAFT` and
 * `REJECTED` only, `saveDraft` leaves every non-`PUBLISHED` status exactly
 * where it found it, and there is no delete-listing path at all. Without this
 * entry the console's own suspend button would be a one-way door — a listing
 * a manager can take down from a screen and return only with raw SQL — and it
 * would be this table's own doing, since before the console existed no writer
 * in the codebase could produce `SUSPENDED` in the first place. That is
 * exactly the irreversibility the argument for a reversible `REMOVE` above
 * rejects, and a listing deserves it no less than an account.
 *
 * It needs no schema change. The restoration logs as `APPROVE_LISTING` —
 * `ModAction` has had that member all along and the log renders it as
 * "Listing approved", which is precisely what happened. (An earlier version
 * of this comment asserted the opposite: that an "unsuspend" transition would
 * need a `ModAction` member the enum does not have, and that a suspended
 * listing could meanwhile be rejected or resubmitted. All three claims were
 * false, which is why the dead end went unnoticed.)
 *
 * The two columns an approval touches need no per-status branch in
 * `moderateListing` (`@/server/actions/moderation`): `publishedAt` is stamped
 * only when it is null, so a restored listing keeps the date it first went
 * live instead of floating to the top of the catalog's `newest` sort, and
 * `rejectionReason` is cleared — which for a `SUSPENDED` listing is a no-op,
 * since the only writer of that column sets it on the way into `REJECTED`.
 *
 * **What adding this entry did require was tightening that action's write.**
 * An earlier version of this comment asserted the opposite — that
 * `moderateListing` already handled the new source status "with no special
 * case" — and it was wrong in a way a `FOR UPDATE` lock made visible. The
 * write used to be conditioned on this whole `from` array, so an approval
 * that read `PENDING_REVIEW` (null `publishedAt`) and was overtaken by a
 * concurrent publish-then-suspend matched on `SUSPENDED` and re-stamped a
 * `publishedAt` that was already set. The action now pins the exact status it
 * read, and its module doc carries the reproduction. Recorded here because
 * this table is where the next widening will be written: a `from` list with
 * more than one member is only safe for a write whose payload does not depend
 * on which member matched.
 */
export const LISTING_TRANSITIONS: Record<
  ListingModerationAction,
  StatusTransition<AssetStatus>
> = {
  APPROVE: { from: ['PENDING_REVIEW', 'SUSPENDED'], to: 'PUBLISHED' },
  REJECT: { from: ['PENDING_REVIEW'], to: 'REJECTED' },
  SUSPEND: { from: ['PUBLISHED'], to: 'SUSPENDED' },
}
