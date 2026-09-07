'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { requireViewer } from '@/server/session'
import { canDecideAccess, canRequestAccess, canRevokeAccess, type AssetRef } from '@/lib/authz'
import { mapGrantState } from '@/lib/gate'
import { buildThreadKey } from '@/lib/thread-key'
import type { ActionResult } from './types'

/**
 * Every action below follows the identical shape laid out
 * below: `requireViewer` first, then load the row the mutation targets and
 * build the `AssetRef` the `@/lib/authz` predicates expect, then call the
 * matching predicate and bail out with `FORBIDDEN` before anything is
 * validated or written. The predicate call is never skipped and never
 * replaced by re-deriving the same rule inline — the loaded `GrantState` is
 * passed straight into `canDecideAccess`/`canRevokeAccess`, exactly as read
 * from the database, so the transition rule lives in exactly one place
 * (`@/lib/authz`).
 *
 * Authorization runs *before* zod validation everywhere here, deliberately:
 * an unauthorized caller learns only `FORBIDDEN`, never `INVALID`, so a
 * malformed payload cannot be used to probe which *fields* a request would
 * have accepted, or to distinguish a well-formed refusal from a malformed
 * one.
 *
 * It does **not** hide whether a given id exists. The `NOT_FOUND` two lines
 * into each action below is returned before any predicate runs, so a caller
 * holding an id can tell "this row exists and is not yours" (`FORBIDDEN`)
 * from "no such row" (`NOT_FOUND`). That is a deliberate exception to the
 * "hidden and non-existent look identical" rule the pages keep: every id here
 * is a cuid and non-enumerable, the *pages* honour the rule with
 * byte-identical 404s on both cases, and closing it would cost a second query
 * to conceal something only a caller who already holds the id could observe.
 * `@/server/actions/messages` and `@/server/actions/assets` share the shape
 * and the decision.
 */

// ---------------------------------------------------------------------------
// requestAccess
// ---------------------------------------------------------------------------

export interface RequestAccessInput {
  assetId: string
  message: string
  locale: string
}

const requestAccessPayload = z.object({
  message: z.string().trim().max(1000),
})

/**
 * A buyer's ask for the confidential half of a listing. Creates the
 * `AccessRequest` row in `'REQUESTED'` status.
 *
 * The unique constraint on `(assetId, buyerProfileId)` is the real backstop
 * against a double submit, not the `canRequestAccess` check above it: two
 * concurrent submits can both read the same `'NONE'` grant and both pass the
 * predicate before either write commits, so Postgres — not this function's
 * own read-then-write — is what actually prevents two rows. `P2002` is
 * caught and turned into `ALREADY_REQUESTED` rather than a crash.
 */
export async function requestAccess(input: RequestAccessInput): Promise<ActionResult> {
  const viewer = await requireViewer(input.locale)

  const asset = await prisma.asset.findUnique({
    where: { id: input.assetId },
    select: {
      id: true,
      sellerProfileId: true,
      status: true,
      sellerProfile: { select: { user: { select: { status: true } } } },
    },
  })
  if (!asset) return { ok: false, error: 'NOT_FOUND' }

  const ref: AssetRef = {
    id: asset.id,
    sellerProfileId: asset.sellerProfileId,
    status: asset.status,
    ownerStatus: asset.sellerProfile.user.status,
  }

  // Only the viewer's own request against this asset, never every request
  // for it — the same restraint `getAssetDetail` (`@/server/queries/assets`)
  // documents for the identical read.
  const existing =
    viewer.buyerProfileId !== null
      ? await prisma.accessRequest.findUnique({
          where: { assetId_buyerProfileId: { assetId: ref.id, buyerProfileId: viewer.buyerProfileId } },
          select: { status: true },
        })
      : null
  const grant = mapGrantState(existing?.status ?? null)

  if (!canRequestAccess(viewer, ref, grant)) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  const parsed = requestAccessPayload.safeParse({ message: input.message })
  if (!parsed.success) return { ok: false, error: 'INVALID' }

  try {
    await prisma.accessRequest.create({
      data: {
        assetId: ref.id,
        // `canRequestAccess` requires a non-null `buyerProfileId` to return
        // true, so this is non-null on every path that reaches here.
        buyerProfileId: viewer.buyerProfileId as string,
        message: parsed.data.message,
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: 'ALREADY_REQUESTED' }
    }
    throw error
  }

  revalidatePath(`/${input.locale}/listings/${ref.id}`)
  // `/dashboard` reads these same rows — the seller's catalogue-wide
  // request queue and the buyer's own list of asks — and the seller decides
  // requests from there as well as from the listing page. `/dashboard` is
  // dynamic (it reads the session) and so is never served from a cache, so
  // what this call actually buys is the updated RSC payload Next sends back
  // with the action's response: without it the decided row stays on screen
  // until a manual reload, exactly as the listing page would.
  revalidatePath(`/${input.locale}/dashboard`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// decideAccess
// ---------------------------------------------------------------------------

export interface DecideAccessInput {
  requestId: string
  decision: 'APPROVED' | 'DECLINED'
  locale: string
}

const decideAccessPayload = z.object({
  decision: z.enum(['APPROVED', 'DECLINED']),
})

/**
 * The owning seller's verdict on a pending request. Legal only from
 * `'REQUESTED'` — `canDecideAccess` enforces that with the `GrantState` read
 * here, this function does not re-check the transition itself.
 *
 * That read-then-check is still a TOCTOU gap on its own: two concurrent
 * `decideAccess` calls on the *same* request both read `'REQUESTED'` and
 * both pass `canDecideAccess` before either writes. Postgres row-level
 * locking serialises the two `UPDATE`s rather than raising a unique-
 * constraint error (there is no unique constraint on `AccessRequest.status`
 * to violate), so an unconditional `update` would let the second, later
 * write silently overwrite the first's `status`/`decidedAt`/
 * `decidedByUserId` — a `DECLINED` verdict could end up stamped over an
 * `APPROVED` one that already has a `Conversation`. The write below is
 * therefore conditioned on the exact state this function validated
 * (`status: 'REQUESTED'`) via `updateMany`, so the database — not a caught
 * exception — enforces the transition: the loser's write matches zero rows
 * and this returns `FORBIDDEN` without touching anything else.
 *
 * On approval, this is the moment the two parties may talk: it opens a
 * `Conversation` between them if one does not already exist (keyed by
 * `buildThreadKey`), seeded with the buyer's original request message. The
 * `updateMany` guard above means only the single winner of a concurrent
 * decide ever reaches this step, so there is no remaining race on
 * `Conversation.threadKey` either. The seller's inbox is never empty after
 * they approve someone.
 */
export async function decideAccess(input: DecideAccessInput): Promise<ActionResult> {
  const viewer = await requireViewer(input.locale)

  const request = await prisma.accessRequest.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      status: true,
      message: true,
      buyerProfileId: true,
      buyerProfile: { select: { userId: true } },
      asset: {
        select: {
          id: true,
          sellerProfileId: true,
          status: true,
          sellerProfile: { select: { user: { select: { status: true } } } },
        },
      },
    },
  })
  if (!request) return { ok: false, error: 'NOT_FOUND' }

  const ref: AssetRef = {
    id: request.asset.id,
    sellerProfileId: request.asset.sellerProfileId,
    status: request.asset.status,
    ownerStatus: request.asset.sellerProfile.user.status,
  }
  const grant = mapGrantState(request.status)

  if (!canDecideAccess(viewer, ref, grant)) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  const parsed = decideAccessPayload.safeParse({ decision: input.decision })
  if (!parsed.success) return { ok: false, error: 'INVALID' }

  const { decision } = parsed.data

  const result = await prisma.$transaction(async (tx) => {
    // The write itself is conditioned on the exact state validated above,
    // not just on `id` — this is what actually closes the race the doc
    // comment describes. A concurrent decide that already settled this
    // request between our read and this write leaves `status` no longer
    // `'REQUESTED'`, so this matches zero rows instead of overwriting it.
    const updated = await tx.accessRequest.updateMany({
      where: { id: request.id, status: 'REQUESTED' },
      data: {
        status: decision,
        decidedAt: new Date(),
        decidedByUserId: viewer.userId,
      },
    })
    if (updated.count === 0) {
      return { ok: false, error: 'FORBIDDEN' } as const
    }

    if (decision === 'APPROVED') {
      const threadKey = buildThreadKey({
        assetId: ref.id,
        buyerProfileId: request.buyerProfileId,
        sellerProfileId: ref.sellerProfileId,
      })
      const conversation = await tx.conversation.findUnique({ where: { threadKey } })
      if (!conversation) {
        await tx.conversation.create({
          data: {
            threadKey,
            assetId: ref.id,
            buyerProfileId: request.buyerProfileId,
            sellerProfileId: ref.sellerProfileId,
            messages: {
              create: {
                senderUserId: request.buyerProfile.userId,
                body: request.message,
              },
            },
          },
        })
      }
    }

    return { ok: true } as const
  })

  if (!result.ok) return result

  revalidatePath(`/${input.locale}/listings/${ref.id}`)
  // `/dashboard` reads these same rows — the seller's catalogue-wide
  // request queue and the buyer's own list of asks — and the seller decides
  // requests from there as well as from the listing page. `/dashboard` is
  // dynamic (it reads the session) and so is never served from a cache, so
  // what this call actually buys is the updated RSC payload Next sends back
  // with the action's response: without it the decided row stays on screen
  // until a manual reload, exactly as the listing page would.
  revalidatePath(`/${input.locale}/dashboard`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// revokeAccess
// ---------------------------------------------------------------------------

export interface RevokeAccessInput {
  requestId: string
  locale: string
}

/**
 * The owner or a manager withdraws a previously approved grant. Legal only
 * from `'APPROVED'` — `canRevokeAccess` enforces that with the `GrantState`
 * read here.
 *
 * The same read-then-check-then-write gap `decideAccess` closes applies
 * here too (not flagged separately, but the same shape): the final write is
 * conditioned on `status: 'APPROVED'` via `updateMany`, not just on `id`, so
 * a request a concurrent call already moved off `'APPROVED'` (revoked twice,
 * or revoked the same instant a manager acted on it) matches zero rows
 * instead of silently re-stamping `decidedAt`/`decidedByUserId`.
 *
 * Does not delete the `Conversation`: the parties already spoke, and erasing
 * that history would remove something a manager may later need to review.
 */
export async function revokeAccess(input: RevokeAccessInput): Promise<ActionResult> {
  const viewer = await requireViewer(input.locale)

  const request = await prisma.accessRequest.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      status: true,
      asset: {
        select: {
          id: true,
          sellerProfileId: true,
          status: true,
          sellerProfile: { select: { user: { select: { status: true } } } },
        },
      },
    },
  })
  if (!request) return { ok: false, error: 'NOT_FOUND' }

  const ref: AssetRef = {
    id: request.asset.id,
    sellerProfileId: request.asset.sellerProfileId,
    status: request.asset.status,
    ownerStatus: request.asset.sellerProfile.user.status,
  }
  const grant = mapGrantState(request.status)

  if (!canRevokeAccess(viewer, ref, grant)) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  const updated = await prisma.accessRequest.updateMany({
    where: { id: request.id, status: 'APPROVED' },
    data: { status: 'REVOKED', decidedAt: new Date(), decidedByUserId: viewer.userId },
  })
  if (updated.count === 0) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  revalidatePath(`/${input.locale}/listings/${ref.id}`)
  // `/dashboard` reads these same rows — the seller's catalogue-wide
  // request queue and the buyer's own list of asks — and the seller decides
  // requests from there as well as from the listing page. `/dashboard` is
  // dynamic (it reads the session) and so is never served from a cache, so
  // what this call actually buys is the updated RSC payload Next sends back
  // with the action's response: without it the decided row stays on screen
  // until a manual reload, exactly as the listing page would.
  revalidatePath(`/${input.locale}/dashboard`)
  return { ok: true }
}
