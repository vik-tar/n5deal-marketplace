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
 * Every action below follows the identical shape ruling 3 (Task 14) lays
 * out: `requireViewer` first, then load the row the mutation targets and
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
 * malformed payload cannot be used to probe whether a given id would have
 * been accepted had the caller been allowed to act on it.
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
 * On approval, this is the moment the two parties may talk: it opens a
 * `Conversation` between them if one does not already exist (keyed by
 * `buildThreadKey`, so a request decided twice — which `canDecideAccess`
 * already forbids after the first decision — could never create a second
 * thread even if it somehow ran twice), seeded with the buyer's original
 * request message. The seller's inbox is never empty after they approve
 * someone.
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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.accessRequest.update({
        where: { id: request.id },
        data: {
          status: decision,
          decidedAt: new Date(),
          decidedByUserId: viewer.userId,
        },
      })

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
    })
  } catch (error) {
    // Mirrors `requestAccess`'s P2002 guard: two concurrent `decideAccess`
    // calls approving the *same* request can both read it as `'REQUESTED'`
    // before either commits, both pass `canDecideAccess`, and both attempt
    // to create the same `Conversation` (unique on `threadKey`) — the loser
    // rolls back its whole transaction, including its own otherwise-valid
    // `accessRequest.update`. By the time that happens the request has
    // already been decided by the other caller, so this caller is no longer
    // able to decide it — the same shape of answer `canDecideAccess` itself
    // would give post-commit.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: 'FORBIDDEN' }
    }
    throw error
  }

  revalidatePath(`/${input.locale}/listings/${ref.id}`)
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

  await prisma.accessRequest.update({
    where: { id: request.id },
    data: { status: 'REVOKED', decidedAt: new Date(), decidedByUserId: viewer.userId },
  })

  revalidatePath(`/${input.locale}/listings/${ref.id}`)
  return { ok: true }
}
