'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { Prisma, type UserStatus } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { requireViewer } from '@/server/session'
import { canBrowseBuyers, canMessage, canViewAsset, type AssetRef, type Viewer } from '@/lib/authz'
import { buildThreadKey } from '@/lib/thread-key'
import { unreadForViewerWhere } from '@/server/queries/conversation-where'
import type { ActionError, ActionResult } from './types'

/**
 * Messaging's three mutations. All three follow the shape
 * `access-requests.ts` documents: `requireViewer` first, then load the row
 * the mutation targets, then call the `@/lib/authz` predicate and bail out
 * with `FORBIDDEN` before anything is validated or written — so an
 * unauthorized caller learns only `FORBIDDEN`, never `INVALID`, and cannot
 * use a malformed payload to probe what would have been accepted.
 *
 * The predicate is always `canMessage`, always against the counterparty's
 * *live* account status read in the same request — never against a status
 * cached on the conversation or trusted from the client. That is what makes
 * a mid-negotiation suspension take effect on the very next reply attempt,
 * matching what `getViewer` (`@/server/session`) already guarantees for the
 * sender's own side.
 *
 * `canMessage` (`@/lib/authz`) is settled and tested: cold contact is
 * allowed — no approved grant, no shared listing, no prior relationship —
 * both parties must be `ACTIVE`, they must be two different people, and a
 * `MANAGER` may never message. Nothing here widens or narrows it.
 */

const messageBodySchema = z.string().trim().min(1).max(4000)

/**
 * Every write below bumps the same three surfaces, and every one of them is
 * load-bearing — the dashboard case was verified by replaying the real
 * Server Action POST: `/inbox` shows the thread list with its unread dots,
 * `/inbox/[id]` shows the thread itself, and `/dashboard` renders the unread
 * *count* on both the buyer's and the seller's side. All three are dynamic
 * — they read the session, so nothing is served from a cache — and what the
 * call actually buys is the refreshed RSC payload Next sends back with the
 * action's own response. Without it the dot stays lit until a manual reload.
 */
function revalidateMessagingSurfaces(locale: string, conversationId: string): void {
  revalidatePath(`/${locale}/inbox`)
  revalidatePath(`/${locale}/inbox/${conversationId}`)
  revalidatePath(`/${locale}/dashboard`)
}

// ---------------------------------------------------------------------------
// startConversation
// ---------------------------------------------------------------------------

/**
 * The two directions cold contact runs in, and the only two entry points
 * that exist: a buyer opening a thread from a listing (`asset`), and a
 * seller opening one from the buyer directory (`buyer`). They are a
 * discriminated union rather than one optional-field bag because the two
 * carry genuinely different ids from genuinely different URLs, and the
 * counterparty is derived from a *different* row in each case.
 */
export type StartConversationTarget =
  | { kind: 'asset'; assetId: string }
  | { kind: 'buyer'; buyerProfileId: string }

export interface StartConversationInput {
  target: StartConversationTarget
  locale: string
}

/**
 * Carries the id of the thread the caller should now open, so the client can
 * navigate into it — the same shape `SaveDraftResult`
 * (`@/server/actions/assets`) uses to hand back the id of the listing it just
 * created.
 *
 * Rejected alternative: calling `redirect()` inside the action. It works, but
 * it turns the success path of a Server Action into a thrown `NEXT_REDIRECT`
 * — control flow the type system cannot see and one stray `try`/`catch`
 * around the call away from failing silently, which is precisely the hazard
 * `redirectNow` (`@/server/session`) exists to document. Every other mutation
 * in this app returns its result; this one does too, and the client
 * navigates.
 */
export type StartConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: ActionError }

/** The three ids a `Conversation` is keyed by, plus the party to check `canMessage` against. */
interface ResolvedThread {
  assetId: string | null
  buyerProfileId: string
  sellerProfileId: string
  counterparty: { userId: string; status: UserStatus }
}

type ResolveResult = { ok: true; thread: ResolvedThread } | { ok: false; error: ActionError }

/**
 * A buyer contacting the seller behind a listing.
 *
 * `canViewAsset` is checked before anything else and its failure returns
 * `NOT_FOUND`, not `FORBIDDEN`: a listing this viewer may not see must look
 * exactly like a listing that does not exist, the same rule `getAssetDetail`
 * follows. Without it, "open a thread about it" would be a way to confirm
 * that a draft listing exists and who owns it.
 *
 * A viewer with no `BuyerProfile` is refused even though `canMessage` would
 * happily allow it — a seller may message another seller as far as that
 * predicate is concerned, but a `Conversation` has a buyer side and a seller
 * side and there is no row to put them on. The UI does not offer the button
 * in that case either (`canContactSeller`, `@/server/queries/assets`), so
 * this is the backstop, not the only guard.
 */
async function resolveAssetThread(viewer: Viewer, assetId: string): Promise<ResolveResult> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      sellerProfileId: true,
      status: true,
      sellerProfile: { select: { user: { select: { id: true, status: true } } } },
    },
  })
  if (!asset) return { ok: false, error: 'NOT_FOUND' }

  const ref: AssetRef = {
    id: asset.id,
    sellerProfileId: asset.sellerProfileId,
    status: asset.status,
    ownerStatus: asset.sellerProfile.user.status,
  }
  if (!canViewAsset(viewer, ref)) return { ok: false, error: 'NOT_FOUND' }
  if (viewer.buyerProfileId === null) return { ok: false, error: 'FORBIDDEN' }

  return {
    ok: true,
    thread: {
      assetId: asset.id,
      buyerProfileId: viewer.buyerProfileId,
      sellerProfileId: asset.sellerProfileId,
      counterparty: { userId: asset.sellerProfile.user.id, status: asset.sellerProfile.user.status },
    },
  }
}

/**
 * A seller contacting a buyer from the directory.
 *
 * `canBrowseBuyers` runs *before* the lookup, so a viewer who may not browse
 * the directory cannot use this action to probe whether a `buyerProfileId`
 * exists — the same reason `listBuyers` returns an empty page rather than a
 * 403 for them.
 *
 * The thread is deliberately asset-less. Tying it to the listing the seller
 * happened to be scoring the buyer against (`?forAsset=` on the buyer detail
 * page) was considered and rejected: it would mean trusting an asset id from
 * a query string and re-proving ownership of it here, for a label. An
 * asset-less thread is exactly what `buildThreadKey`'s `noasset` sentinel
 * exists for, and it collapses every cold approach from one seller to one
 * buyer into a single thread instead of one per listing they browsed.
 */
async function resolveBuyerThread(viewer: Viewer, buyerProfileId: string): Promise<ResolveResult> {
  if (!canBrowseBuyers(viewer)) return { ok: false, error: 'FORBIDDEN' }

  const buyer = await prisma.buyerProfile.findUnique({
    where: { id: buyerProfileId },
    select: { id: true, userId: true, user: { select: { status: true } } },
  })
  if (!buyer) return { ok: false, error: 'NOT_FOUND' }
  if (viewer.sellerProfileId === null) return { ok: false, error: 'FORBIDDEN' }

  return {
    ok: true,
    thread: {
      assetId: null,
      buyerProfileId: buyer.id,
      sellerProfileId: viewer.sellerProfileId,
      counterparty: { userId: buyer.userId, status: buyer.user.status },
    },
  }
}

/**
 * Opens the thread between the viewer and the counterparty, or hands back
 * the one that already exists.
 *
 * The write is an upsert on `threadKey`, and the unique constraint on that
 * column — not this function's own read-then-write — is what actually
 * guarantees one thread per (asset, buyer, seller) triple. Two clicks
 * landing in the same instant both find nothing and both insert; Postgres
 * lets exactly one of them win. `buildThreadKey` (`@/lib/thread-key`) is why
 * the constraint can be carried on a single column at all: Postgres treats
 * NULLs as distinct, so a composite unique over `(assetId, buyerProfileId,
 * sellerProfileId)` would allow unlimited duplicate asset-less threads.
 *
 * `decideAccess` (`@/server/actions/access-requests`) already opens a
 * conversation on approval, keyed the same way and reusing an existing
 * thread rather than creating a second one. This action is the same door
 * from the other side, not a parallel creation path: a buyer who was already
 * approved and then presses "Contact seller" lands in the thread that
 * approval opened, with its history intact.
 */
export async function startConversation(input: StartConversationInput): Promise<StartConversationResult> {
  const viewer = await requireViewer(input.locale)

  const resolved =
    input.target.kind === 'asset'
      ? await resolveAssetThread(viewer, input.target.assetId)
      : await resolveBuyerThread(viewer, input.target.buyerProfileId)
  if (!resolved.ok) return resolved

  const { thread } = resolved
  if (!canMessage(viewer, thread.counterparty)) return { ok: false, error: 'FORBIDDEN' }

  const threadKey = buildThreadKey({
    assetId: thread.assetId,
    buyerProfileId: thread.buyerProfileId,
    sellerProfileId: thread.sellerProfileId,
  })

  let conversationId: string
  try {
    // `update: {}` on purpose: an existing thread must come back exactly as
    // it is. Opening a conversation a second time is not an event — bumping
    // `lastMessageAt` here would float a thread nobody wrote in to the top
    // of both parties' inboxes.
    //
    // The `create` above floats one anyway, and no value written here could
    // stop it: `lastMessageAt` carries `@default(now())`, so a brand-new
    // thread is stamped with the present instant whatever this action does,
    // and a click on "Contact seller" followed by silence used to put an
    // empty row above every live negotiation. That is fixed in the *ordering*
    // instead — `compareConversationsByActivity`
    // (`@/server/queries/conversation-where`) sinks threads with no messages
    // below threads with them — because the alternative, writing a backdated
    // timestamp the thread never earned, puts a lie in a column `/inbox`
    // renders as the row's date.
    const conversation = await prisma.conversation.upsert({
      where: { threadKey },
      create: {
        threadKey,
        assetId: thread.assetId,
        buyerProfileId: thread.buyerProfileId,
        sellerProfileId: thread.sellerProfileId,
      },
      update: {},
      select: { id: true },
    })
    conversationId = conversation.id
  } catch (error) {
    // This branch is the primary mechanism, not a backstop. Measured on
    // 2026-09-06 with `log_statement='all'` on the local Postgres: on Prisma 7
    // with the `PrismaPg` driver adapter, `upsert` does *not* compile to a
    // native `INSERT ... ON CONFLICT` here — it emits a plain `INSERT ...
    // RETURNING`, and a 12-way concurrent burst logged `duplicate key value
    // violates unique constraint "Conversation_threadKey_key"` on the losers.
    // All 12 calls still returned the same conversationId and exactly one row
    // existed afterwards, because every loser lands here.
    //
    // So the guarantee is: the unique constraint on `threadKey` decides the
    // winner, and P2002 plus a re-read by that same key is how everyone else
    // finds the row the winner committed — which is the thread they wanted.
    // Anything that is not a P2002 is a real failure and is rethrown.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const existing = await prisma.conversation.findUnique({ where: { threadKey }, select: { id: true } })
    if (!existing) throw error
    conversationId = existing.id
  }

  revalidateMessagingSurfaces(input.locale, conversationId)
  return { ok: true, conversationId }
}

// ---------------------------------------------------------------------------
// sendMessage and markRead
// ---------------------------------------------------------------------------

export interface SendMessageInput {
  conversationId: string
  body: string
  locale: string
}

export interface MarkReadInput {
  conversationId: string
  locale: string
}

/**
 * Both mutations below need the same two facts — is this viewer a party to
 * this thread, and who is the other one — so they load them once, here.
 *
 * Participation is by *profile* id, matching how a `Conversation` names its
 * parties, and a viewer holding neither profile row (a `MANAGER`) matches
 * neither side. A manager is refused by the ordinary participation rule
 * rather than by a special case, exactly as they are in
 * `@/server/queries/conversations`.
 *
 * A missing thread returns `NOT_FOUND` and a thread that is not the viewer's
 * returns `FORBIDDEN`, which is the shape every action in this codebase uses
 * (`decideAccess` does the same). The residual leak is accepted: a caller
 * can tell "this id exists" from "it does not", which against non-enumerable
 * cuids says nothing about content.
 */
type ParticipationResult =
  | { ok: true; counterparty: { userId: string; status: UserStatus } }
  | { ok: false; error: ActionError }

async function loadParticipation(conversationId: string, viewer: Viewer): Promise<ParticipationResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      buyerProfileId: true,
      sellerProfileId: true,
      buyerProfile: { select: { userId: true, user: { select: { status: true } } } },
      sellerProfile: { select: { userId: true, user: { select: { status: true } } } },
    },
  })
  if (!conversation) return { ok: false, error: 'NOT_FOUND' }

  const viewerIsBuyer = conversation.buyerProfileId === viewer.buyerProfileId
  const viewerIsSeller = conversation.sellerProfileId === viewer.sellerProfileId
  if (!viewerIsBuyer && !viewerIsSeller) return { ok: false, error: 'FORBIDDEN' }

  const other = viewerIsBuyer ? conversation.sellerProfile : conversation.buyerProfile
  return { ok: true, counterparty: { userId: other.userId, status: other.user.status } }
}

/**
 * Appends one message and bumps the thread's `lastMessageAt`, in one
 * transaction: the ordering key on `/inbox` is not allowed to disagree with
 * the messages the thread actually holds, and a half-applied write would
 * leave a thread whose newest message is older than its own sort key.
 *
 * `lastMessageAt` is set from `new Date()` rather than from the created
 * row's `createdAt` because both default to the same instant and reading it
 * back would cost a round trip; the two can differ by microseconds, which no
 * consumer of a "newest first" ordering can observe.
 */
export async function sendMessage(input: SendMessageInput): Promise<ActionResult> {
  const viewer = await requireViewer(input.locale)

  const participation = await loadParticipation(input.conversationId, viewer)
  if (!participation.ok) return participation
  if (!canMessage(viewer, participation.counterparty)) return { ok: false, error: 'FORBIDDEN' }

  const parsed = messageBodySchema.safeParse(input.body)
  if (!parsed.success) return { ok: false, error: 'INVALID' }

  await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: input.conversationId, senderUserId: viewer.userId, body: parsed.data },
    }),
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: new Date() },
    }),
  ])

  revalidateMessagingSurfaces(input.locale, input.conversationId)
  return { ok: true }
}

/**
 * Stamps `readAt` on the messages in this thread the viewer has not read,
 * called when they open it.
 *
 * The `where` is `unreadForViewerWhere` (`@/server/queries/conversation-where`)
 * — the same clause the dashboards and `/inbox` count with. That shared
 * definition is the point: if this marked a wider set than the counts count,
 * the dot would clear on threads the viewer had not read, and if it marked a
 * narrower one the dot would never clear at all. It is also what keeps the
 * viewer's own sent messages out of the update, which would otherwise be
 * marked "read by me" on the way past and quietly break any future read
 * receipt built on the same column.
 *
 * Deliberately not `canMessage`-gated: reading your own mail is not
 * transacting, and a party whose counterparty was suspended must still be
 * able to clear a dot. Participation is the whole rule.
 */
export async function markRead(input: MarkReadInput): Promise<ActionResult> {
  const viewer = await requireViewer(input.locale)

  const participation = await loadParticipation(input.conversationId, viewer)
  if (!participation.ok) return participation

  const updated = await prisma.message.updateMany({
    where: { conversationId: input.conversationId, ...unreadForViewerWhere(viewer.userId) },
    data: { readAt: new Date() },
  })

  // Nothing changed means nothing to refresh — a thread opened twice must
  // not trigger a second round of revalidation on three surfaces.
  if (updated.count === 0) return { ok: true }

  revalidateMessagingSurfaces(input.locale, input.conversationId)
  return { ok: true }
}
