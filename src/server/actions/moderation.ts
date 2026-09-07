'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { ModAction, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { requireViewer } from '@/server/session'
import { toAppLocale } from '@/i18n/locale'
import { canModerate, canModerateUser } from '@/lib/authz'
import { moderationReasonSchema } from '@/lib/validation/moderation'
import {
  LISTING_TRANSITIONS,
  USER_TRANSITIONS,
  type ListingModerationAction,
  type UserModerationAction,
} from '@/server/queries/admin-where'
import type { ActionResult } from './types'

/**
 * The four moderation mutations, and the audit trail that makes them
 * accountable.
 *
 * Every one of them follows the shape Task 14's `access-requests.ts`
 * documents: `requireViewer` first, then load the row the mutation targets,
 * then call the `@/lib/authz` predicate and bail out with `FORBIDDEN` before
 * anything is validated or written — so an unauthorized caller learns only
 * `FORBIDDEN`, never `INVALID`, and cannot use a malformed payload to probe
 * what would have been accepted. Only then does zod see the reason, and only
 * then is the transition's legality considered.
 *
 * **The `ModerationLog` row is written in the same transaction as the status
 * change, and that is not a convenience.** Design decision D4 exists to
 * prevent exactly one thing: a status change nobody can explain afterwards.
 * If the log write were a second statement after a committed update, then any
 * failure between them — a crashed process, a lost connection — leaves a
 * suspended account with no recorded reason, and `/suspended`
 * (`src/app/[locale]/suspended/page.tsx`) reads that very row to tell the
 * suspended user why. Two writes, one transaction, both or neither.
 *
 * **Every write is conditioned on the exact statuses the transition declares
 * legal**, via `updateMany` rather than `update` — the pattern `decideAccess`
 * established after Task 14's review showed that an unconditioned write
 * silently overwrites a concurrent one. Two managers acting on the same
 * account in the same instant both read `ACTIVE` and both pass every check
 * above; the database, not this function's own read, decides which one wins,
 * and the loser matches zero rows, writes no log entry, and returns
 * `FORBIDDEN`.
 *
 * The transitions themselves live in `@/server/queries/admin-where`
 * (`USER_TRANSITIONS`, `LISTING_TRANSITIONS`) rather than inline here, for
 * the reason every `*-where.ts` module in this codebase exists: that module
 * imports no Prisma client, so the rules are unit-testable with
 * `DATABASE_URL` unset, and this file cannot drift from them.
 */

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

export interface ModerateUserInput {
  userId: string
  reason: string
  locale: string
}

export interface ModerateListingInput {
  assetId: string
  decision: ListingModerationAction
  reason: string
  locale: string
}

const listingDecisionSchema = z.enum(['APPROVE', 'REJECT', 'SUSPEND'])

/**
 * The surfaces a moderation decision changes.
 *
 * Honest about what this buys, because it is less than it looks: every page
 * in this application is dynamic (the locale layout calls `getViewer`, which
 * reads the session), so nothing here is served from a cache and there is no
 * stale entry to invalidate. What the calls actually deliver is the refreshed
 * RSC payload Next sends back with the action's own response — which for a
 * manager acting from the console means `/admin` is the load-bearing one:
 * without it the row they just acted on keeps its old status until a manual
 * reload. `/listings` and `/buyers` are the two public surfaces whose
 * *contents* this decision changed, listed so that the day any of them gains
 * a cache, the invalidation is already correct.
 *
 * The locale is validated through `toAppLocale` before it is interpolated,
 * unlike the six older `revalidatePath` call sites in this codebase, which
 * build `/${locale}/…` from raw input. Task 19 deliberately left those alone —
 * a forged value revalidates a path that does not exist, changing nothing an
 * attacker can observe — and this does not reopen that decision; it is simply
 * free in new code, and a revalidated path that is always a real one is worth
 * the one import.
 */
function revalidateModerationSurfaces(locale: string, assetId?: string): void {
  revalidatePath(`/${locale}/admin`)
  revalidatePath(`/${locale}/listings`)
  revalidatePath(`/${locale}/buyers`)
  if (assetId !== undefined) revalidatePath(`/${locale}/listings/${assetId}`)
}

// ---------------------------------------------------------------------------
// Account moderation
// ---------------------------------------------------------------------------

/**
 * The body of `suspendUser`, `reinstateUser` and `removeUser`, which differ
 * only in which transition they apply and which `ModAction` they log.
 *
 * `UserModerationAction`'s three members are `ModAction` members verbatim, so
 * the logged action is the caller's own intent rather than a mapping this
 * function could get wrong. `moderateListing` below cannot do the same — its
 * vocabulary and `ModAction`'s do not line up — and says so where it maps.
 *
 * Not exported: a `'use server'` module's exports are network-reachable
 * endpoints, so the three thin wrappers below are the only doors, each with
 * its transition fixed in code rather than taken from the caller. An exported
 * `applyUserModeration(input, action)` would let a client pick the
 * transition, which is exactly one forged field away from "reinstate" meaning
 * "remove".
 */
async function applyUserModeration(
  input: ModerateUserInput,
  action: UserModerationAction,
): Promise<ActionResult> {
  const locale = toAppLocale(input.locale)
  const viewer = await requireViewer(locale)

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, status: true },
  })
  if (!target) return { ok: false, error: 'NOT_FOUND' }

  // `canModerateUser`, not `canModerate`: the difference is the self-check,
  // and it is the difference between a stray click and a manager locking
  // themselves out of the only surface that could undo it. See the
  // predicate's doc comment (`@/lib/authz`).
  if (!canModerateUser(viewer, { userId: target.id })) return { ok: false, error: 'FORBIDDEN' }

  const parsed = moderationReasonSchema.safeParse(input.reason)
  if (!parsed.success) return { ok: false, error: 'INVALID' }

  const transition = USER_TRANSITIONS[action]
  // An early exit, not the enforcement: it saves opening a transaction for a
  // decision that is already impossible (reinstating an active account), and
  // gives the console the same `FORBIDDEN` the conditional write below would.
  // The write is what actually closes the race.
  if (!transition.from.includes(target.status)) return { ok: false, error: 'FORBIDDEN' }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: target.id, status: { in: [...transition.from] } },
      data: { status: transition.to },
    })
    if (updated.count === 0) return { ok: false, error: 'FORBIDDEN' } as const

    await tx.moderationLog.create({
      data: {
        actorUserId: viewer.userId,
        action,
        targetType: 'USER',
        targetId: target.id,
        reason: parsed.data,
      },
    })

    return { ok: true } as const
  })

  if (!result.ok) return result

  revalidateModerationSurfaces(locale)
  return { ok: true }
}

/**
 * Takes an account off the marketplace: their listings leave the public
 * catalog (`VISIBILITY_FLOOR`, `@/server/queries/asset-where`, requires an
 * `ACTIVE` owner), their buyer profile leaves the directory
 * (`BUYER_VISIBILITY_FLOOR`), and `canMessage` (`@/lib/authz`) stops both
 * sending and receiving for them.
 *
 * They keep their session and their sign-in: `getViewer` (`@/server/session`)
 * re-reads `status` on every request, so `requireViewer` sends them to
 * `/suspended` from their very next navigation, and that page renders the
 * `reason` written by the transaction above. The public catalog stays open to
 * them — suspension means you may not transact, not that you may not look
 * (`statusAllowsAuthenticatedSurfaces`, `@/lib/authz`).
 */
export async function suspendUser(input: ModerateUserInput): Promise<ActionResult> {
  return applyUserModeration(input, 'SUSPEND')
}

/**
 * Returns an account to `ACTIVE`, from `SUSPENDED` **or** from `REMOVED` —
 * see `USER_TRANSITIONS` (`@/server/queries/admin-where`) for why removal is
 * reversible. Everything the suspension hid reappears, because nothing was
 * deleted: the listings return to the catalog under their own unchanged
 * statuses, and the conversations and access requests were never touched.
 */
export async function reinstateUser(input: ModerateUserInput): Promise<ActionResult> {
  return applyUserModeration(input, 'REINSTATE')
}

/**
 * The soft delete. `status: 'REMOVED'` and nothing else — no rows are
 * deleted, deliberately: the counterparty's conversations, messages and
 * access requests all reference this account, and erasing it would either
 * cascade through somebody else's negotiation history or leave dangling
 * foreign keys.
 *
 * There is no second mechanism for signing them out, and there must not be:
 * `getViewer` (`@/server/session`) already collapses a `REMOVED` user to
 * `null`, so from their next request they are anonymous — the header offers
 * "Sign in", every authenticated surface redirects to `/login`, and the
 * public catalog is all that is left, exactly as for a visitor who never had
 * an account.
 */
export async function removeUser(input: ModerateUserInput): Promise<ActionResult> {
  return applyUserModeration(input, 'REMOVE')
}

// ---------------------------------------------------------------------------
// Listing moderation
// ---------------------------------------------------------------------------

/**
 * `ModAction` has a dedicated member for approving and for rejecting a
 * listing, but none for taking a published one down — so a listing
 * suspension is logged as plain `SUSPEND` with `targetType: 'ASSET'`.
 *
 * That is what `ModTargetType` is for: `SUSPEND` is the only member of
 * `ModAction` that is target-agnostic (unlike `APPROVE_LISTING`/
 * `REJECT_LISTING`, which name their target in the member itself), and
 * `(SUSPEND, ASSET)` versus `(SUSPEND, USER)` is unambiguous in the log and
 * on screen. The alternative — migrating the enum for a
 * `SUSPEND_LISTING` member — is a schema change this task does not need and
 * would leave the two seeded rows to be re-interpreted.
 */
function logActionFor(decision: ListingModerationAction): ModAction {
  switch (decision) {
    case 'APPROVE':
      return 'APPROVE_LISTING'
    case 'REJECT':
      return 'REJECT_LISTING'
    case 'SUSPEND':
      return 'SUSPEND'
  }
}

/**
 * The manager's verdict on one listing: publish it, send it back with a
 * reason, or take a published one down.
 *
 * **`publishedAt` is stamped only when it is null.** A listing that was
 * published, edited (which returns it to `PENDING_REVIEW` — Task 15's ruling)
 * and re-approved keeps its original publication date, because that column
 * means "when this listing first went live" and the catalog's `newest` sort
 * reads it (`SORT_ORDER`, `@/server/queries/asset-where`). Re-stamping would
 * float a year-old listing to the top of the catalog every time its seller
 * fixed a typo. The rejected alternative — always stamping — would make
 * `publishedAt` mean "last approved", which nothing in the product asks for
 * and which silently rewrites the catalog's ordering.
 *
 * **An approval clears `rejectionReason`.** The seller's dashboard renders
 * that string verbatim on a `REJECTED` listing; leaving a stale one on a
 * now-published listing would be a manager's old complaint attached to a
 * listing that has since satisfied it. `submitForReview`
 * (`@/server/actions/assets`) already clears it on the way in for the same
 * reason; this closes the other end.
 *
 * **A suspension does not write `rejectionReason`,** and that is a known,
 * deliberate gap rather than an oversight. The column is named for rejection,
 * `SellerListingSummary` (`@/server/queries/assets`) documents it as "only
 * ever non-null on a `REJECTED` listing", and both the dashboard and the edit
 * page render it on that basis. Writing a suspension's reason there would
 * quietly break all three. The consequence is real and is recorded rather
 * than papered over: a seller whose listing is suspended sees the status but
 * not the reason, which only the moderation log holds. Closing it properly
 * means a `moderationReason` column, which is a schema change out of this
 * task's scope.
 */
export async function moderateListing(input: ModerateListingInput): Promise<ActionResult> {
  const locale = toAppLocale(input.locale)
  const viewer = await requireViewer(locale)

  const asset = await prisma.asset.findUnique({
    where: { id: input.assetId },
    select: { id: true, status: true, publishedAt: true },
  })
  if (!asset) return { ok: false, error: 'NOT_FOUND' }

  // Plain `canModerate`: there is no self-moderation case for a listing. A
  // `MANAGER` holds no `SellerProfile`, so `isOwner` (`@/lib/authz`) is false
  // for every asset in the database and there is no listing of their own to
  // guard against.
  if (!canModerate(viewer)) return { ok: false, error: 'FORBIDDEN' }

  const parsedDecision = listingDecisionSchema.safeParse(input.decision)
  const parsedReason = moderationReasonSchema.safeParse(input.reason)
  if (!parsedDecision.success || !parsedReason.success) return { ok: false, error: 'INVALID' }

  const decision = parsedDecision.data
  const reason = parsedReason.data
  const transition = LISTING_TRANSITIONS[decision]
  // The same early exit as `applyUserModeration`: the conditional write below
  // is the enforcement, this only avoids opening a transaction for a decision
  // that is already impossible (approving a listing nobody submitted).
  if (!transition.from.includes(asset.status)) return { ok: false, error: 'FORBIDDEN' }

  const data: Prisma.AssetUpdateManyMutationInput = { status: transition.to }
  if (decision === 'APPROVE') {
    data.publishedAt = asset.publishedAt ?? new Date()
    data.rejectionReason = null
  }
  if (decision === 'REJECT') {
    data.rejectionReason = reason
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.asset.updateMany({
      where: { id: asset.id, status: { in: [...transition.from] } },
      data,
    })
    if (updated.count === 0) return { ok: false, error: 'FORBIDDEN' } as const

    await tx.moderationLog.create({
      data: {
        actorUserId: viewer.userId,
        action: logActionFor(decision),
        targetType: 'ASSET',
        targetId: asset.id,
        reason,
      },
    })

    return { ok: true } as const
  })

  if (!result.ok) return result

  revalidateModerationSurfaces(locale, asset.id)
  return { ok: true }
}
