import type { AccessStatus } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import {
  canMessage,
  canViewFullAsset,
  isActive,
  type AssetRef,
  type MaybeViewer,
  type Viewer,
} from '@/lib/authz'
import { mapGrantState } from '@/lib/gate'
import {
  CONVERSATION_SORT_ORDER,
  compareConversationsByActivity,
  isUnreadForViewer,
  participantConversationsWhere,
  unreadForViewerWhere,
} from './conversation-where'

/**
 * The inbox reads. Both refuse the same way every other query in this
 * codebase refuses — by returning nothing (`[]` or `null`), never an error
 * and never a 403 that would confirm a thread exists.
 *
 * **A manager is deliberately not a participant.** Everywhere else in this
 * app a read pairs `isOwner` with `canModerate`, and a reader arriving here
 * will expect the same idiom; this is the one place where `canModerate`
 * intentionally does NOT widen access. A private thread between two parties
 * is the one artefact on this marketplace a manager has no business reading:
 * moderation acts on accounts and listings, and none of its
 * decisions need the contents of a negotiation. A manager holds neither
 * profile row, so `participantConversationsWhere` returns `null` for them
 * and `getConversation` finds them on neither side — they are refused by the
 * same rule that refuses any other non-participant, not by a special case.
 * See the README ("Messaging") for the product-level statement of this.
 */

/** Which side of the market the *other* party sits on. */
export type CounterpartySide = 'BUYER' | 'SELLER'

/**
 * The other party, as this viewer is allowed to know them.
 *
 * `name` is `null` when the counterparty's identity is not disclosed to this
 * viewer — never sent and then hidden, the same shape `SellerSummary`
 * (`@/server/queries/assets`) uses for exactly the same secret. The
 * component renders a neutral role label in that case.
 */
export interface ConversationCounterparty {
  side: CounterpartySide
  name: string | null
}

/** The listing a thread is about, when it is about one at all. */
export interface ConversationAssetRef {
  id: string
  publicRef: string
  teaserTitle: string
}

/** One row of `/inbox`. */
export interface ConversationSummary {
  id: string
  counterparty: ConversationCounterparty
  asset: ConversationAssetRef | null
  lastMessageAt: Date
  /** The newest message's body, or `null` for a thread nobody has written in yet. */
  snippet: string | null
  unreadCount: number
}

/** One message in a thread, from this viewer's point of view. */
export interface ThreadMessage {
  id: string
  body: string
  createdAt: Date
  /** True when the viewer wrote it — the component needs no sender id to align a bubble. */
  mine: boolean
}

export interface ConversationDetail {
  id: string
  counterparty: ConversationCounterparty
  asset: ConversationAssetRef | null
  messages: ThreadMessage[]
  unreadCount: number
  /**
   * Whether `sendMessage` (`@/server/actions/messages`) would accept a reply
   * right now — `canMessage` against the counterparty's *live* account
   * status, not the status they had when the thread was opened. The composer
   * renders disabled with an explanation rather than absent when this is
   * false, so a seller whose buyer was suspended mid-negotiation learns why
   * instead of losing a control.
   */
  canReply: boolean
}

/**
 * The seller's `companyName` is exactly as confidential as the asset's gated
 * fields, which is why `getAssetDetail` nulls it out
 * behind a closed gate. The inbox must not become the back door around that:
 * cold contact is allowed (`canMessage` requires no grant), so a buyer can
 * open a thread with a seller they have no NDA with, and printing the
 * seller's real name at the top of it would hand over the one thing the gate
 * exists to protect.
 *
 * So the name is disclosed to the buyer side only when `canViewFullAsset`
 * says the gate on *this thread's* listing is genuinely open for them — the
 * same predicate the listing page calls, not a re-derived "grant ===
 * APPROVED". An asset-less thread (the seller cold-contacted the buyer;
 * `buildThreadKey`'s `noasset` sentinel) has no gate to be open, so it never
 * discloses: there is no asset, no request, and therefore no NDA. The
 * rejected alternative was "a seller who initiates contact has volunteered
 * their identity" — plausible, but it makes disclosure depend on who clicked
 * first rather than on the gate, and this codebase has exactly one rule for
 * seller identity.
 *
 * Nothing symmetrical is needed in the other direction: a buyer's
 * `displayName` is already visible to every seller through `/buyers`
 * (`canBrowseBuyers`), so a seller reading a thread learns nothing new.
 */
function discloseSellerName(
  viewer: Viewer,
  row: {
    sellerProfileId: string
    sellerProfile: { companyName: string }
    asset: { id: string; status: AssetRef['status']; sellerProfile: { user: { status: AssetRef['ownerStatus'] } } } | null
  },
  grantByAssetId: Map<string, AccessStatus>,
): string | null {
  if (row.asset === null) return null
  const ref: AssetRef = {
    id: row.asset.id,
    sellerProfileId: row.sellerProfileId,
    status: row.asset.status,
    ownerStatus: row.asset.sellerProfile.user.status,
  }
  const grant = mapGrantState(grantByAssetId.get(row.asset.id) ?? null)
  return canViewFullAsset(viewer, ref, grant) ? row.sellerProfile.companyName : null
}

/** The `Asset` columns both reads need: two to show, two to decide disclosure with. */
const THREAD_ASSET_SELECT = {
  id: true,
  publicRef: true,
  teaserTitle: true,
  status: true,
  sellerProfile: { select: { user: { select: { status: true } } } },
} as const

function toAssetRef(
  asset: { id: string; publicRef: string; teaserTitle: string } | null,
): ConversationAssetRef | null {
  if (asset === null) return null
  return { id: asset.id, publicRef: asset.publicRef, teaserTitle: asset.teaserTitle }
}

/**
 * Every thread the viewer is a party to, newest activity first.
 *
 * Ordered in two stages, exactly as `listBuyers` (`@/server/queries/buyers`)
 * is. Postgres does the read in `CONVERSATION_SORT_ORDER` — `lastMessageAt`
 * descending, `id` ascending — so the rows arrive in a defined order at all;
 * then `compareConversationsByActivity` re-sorts them in memory to sink the
 * threads nobody has written in yet below the ones somebody has.
 *
 * That second stage cannot be expressed as a Prisma `orderBy`. Prisma can
 * order by a relation
 * *count* (`messages: { _count: 'desc' }`), which is not the question being
 * asked — a thread with nine messages is not more current than one with one —
 * and there is no way to express "has at least one" as an `orderBy` key. The
 * in-memory sort is over one page of one viewer's own threads, the same scale
 * `listBuyers` sorts at, and both comparators are total orders so the result
 * is stable across renders. `compareConversationsByActivity`
 * (`@/server/queries/conversation-where`) documents the defect it fixes and
 * the two alternatives that were rejected.
 *
 * Three queries, not N+1: the threads, one `groupBy` for every per-thread
 * unread count, and — only when the viewer has a buyer profile — one read of
 * their own grants on the listings those threads are about, which is what
 * decides whether each seller is named (see `discloseSellerName`). The
 * grants read is scoped to `buyerProfileId: viewer.buyerProfileId`, so it
 * cannot see another buyer's standing with the same seller.
 */
export async function listConversations(viewer: MaybeViewer): Promise<ConversationSummary[]> {
  if (!isActive(viewer)) return []
  const where = participantConversationsWhere(viewer)
  if (where === null) return []

  const rows = await prisma.conversation.findMany({
    where,
    orderBy: CONVERSATION_SORT_ORDER,
    select: {
      id: true,
      buyerProfileId: true,
      sellerProfileId: true,
      lastMessageAt: true,
      asset: { select: THREAD_ASSET_SELECT },
      buyerProfile: { select: { displayName: true } },
      sellerProfile: { select: { companyName: true } },
      // The snippet, and nothing else: one row per thread, newest first,
      // with `id` breaking a same-millisecond tie so the preview text is
      // stable across renders.
      messages: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { body: true },
      },
    },
  })
  if (rows.length === 0) return []

  const viewerBuyerProfileId = viewer.buyerProfileId
  const gatedAssetIds = rows
    .filter((row) => row.buyerProfileId === viewerBuyerProfileId && row.asset !== null)
    .map((row) => row.asset!.id)

  const [unreadRows, grantRows] = await Promise.all([
    prisma.message.groupBy({
      by: ['conversationId'],
      where: { conversationId: { in: rows.map((row) => row.id) }, ...unreadForViewerWhere(viewer.userId) },
      _count: { _all: true },
    }),
    viewerBuyerProfileId !== null && gatedAssetIds.length > 0
      ? prisma.accessRequest.findMany({
          where: { buyerProfileId: viewerBuyerProfileId, assetId: { in: gatedAssetIds } },
          select: { assetId: true, status: true },
        })
      : Promise.resolve([]),
  ])

  const unreadByConversationId = new Map(unreadRows.map((row) => [row.conversationId, row._count._all]))
  const grantByAssetId = new Map(grantRows.map((row) => [row.assetId, row.status]))

  // `hasMessages` is derived from the snippet read above — one row per thread,
  // taken only to show a preview — so ranking empty threads costs no extra
  // query. The comparator declares only the three keys it reads
  // (`ConversationSortKey`); passing these wider rows to it is the same
  // structural fit `listBuyers` relies on with `compareBuyersByRecency`.
  const ordered = rows
    .map((row) => ({ ...row, hasMessages: row.messages.length > 0 }))
    .sort(compareConversationsByActivity)

  return ordered.map((row) => {
    // `viewer.buyerProfileId` is `string | null` and `row.buyerProfileId` is
    // always a string, so a viewer with no buyer profile can never match
    // this — no null-vs-null false positive is possible.
    const viewerIsBuyer = row.buyerProfileId === viewer.buyerProfileId
    return {
      id: row.id,
      counterparty: viewerIsBuyer
        ? { side: 'SELLER' as const, name: discloseSellerName(viewer, row, grantByAssetId) }
        : { side: 'BUYER' as const, name: row.buyerProfile.displayName },
      asset: toAssetRef(row.asset),
      lastMessageAt: row.lastMessageAt,
      snippet: row.messages[0]?.body ?? null,
      unreadCount: unreadByConversationId.get(row.id) ?? 0,
    }
  })
}

/**
 * One thread and every message in it, oldest first.
 *
 * Returns `null` for a thread that does not exist *and* for one the viewer
 * is not a party to — including for a manager, deliberately (see this
 * module's header). The two cases are indistinguishable from outside, which
 * is the rule `getAssetDetail` and `getBuyerDetail` already follow.
 *
 * A non-`ACTIVE` viewer is refused too: `requireViewer` sends them to
 * `/suspended` long before this runs, so the guard is defence in depth
 * rather than a reachable branch, and it keeps the "a suspended account
 * reaches no authenticated surface" rule true of this module on
 * its own.
 */
/**
 * How many messages are waiting for this viewer across every thread they are a
 * party to — the number the header puts on its `Inbox` item.
 *
 * Deliberately *not* a fourth way to count unread mail. The two dashboard
 * overviews (`getBuyerOverview`, `@/server/queries/buyers`, and
 * `getSellerOverview`, `@/server/queries/assets`) each count one side of the
 * market, scoping by `buyerProfileId` or `sellerProfileId` because that is all
 * their page shows. The header is the one surface that must span both: a user
 * holding both profile rows has one inbox, not two. So this composes the same
 * two clauses everything else uses — `participantConversationsWhere` for "am I
 * a party to this thread" and `unreadForViewerWhere` for "is this message
 * unread *by me*" — rather than writing a third predicate that could drift
 * from the dot on `/inbox` it has to agree with.
 *
 * The guards mirror `listConversations` above exactly, and both are load
 * bearing. `isActive` keeps a suspended viewer's count at zero, matching a
 * header that offers them no inbox at all. A `null` from
 * `participantConversationsWhere` means the viewer holds neither profile row,
 * which is every manager — so a manager is answered `0` by construction, from
 * the same rule that makes them a party to no conversation, rather than by a
 * role check this module would then have to keep in step.
 *
 * One `count` per page render for a signed-in, non-manager viewer, on top of
 * the `getViewer` read the layout already performs. It is an indexed count
 * over one user's threads, and it is skipped entirely for the two cases that
 * cannot have a number — anonymous and manager.
 */
export async function countUnreadMessages(viewer: MaybeViewer): Promise<number> {
  if (!isActive(viewer)) return 0
  const where = participantConversationsWhere(viewer)
  if (where === null) return 0

  return prisma.message.count({
    where: { conversation: where, ...unreadForViewerWhere(viewer.userId) },
  })
}

export async function getConversation(id: string, viewer: MaybeViewer): Promise<ConversationDetail | null> {
  if (!isActive(viewer)) return null

  const row = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      buyerProfileId: true,
      sellerProfileId: true,
      asset: { select: THREAD_ASSET_SELECT },
      buyerProfile: { select: { displayName: true, userId: true, user: { select: { status: true } } } },
      sellerProfile: { select: { companyName: true, userId: true, user: { select: { status: true } } } },
      messages: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, body: true, createdAt: true, senderUserId: true, readAt: true },
      },
    },
  })
  if (!row) return null

  const viewerIsBuyer = row.buyerProfileId === viewer.buyerProfileId
  const viewerIsSeller = row.sellerProfileId === viewer.sellerProfileId
  if (!viewerIsBuyer && !viewerIsSeller) return null

  const counterpartyUser = viewerIsBuyer ? row.sellerProfile : row.buyerProfile
  const grantByAssetId = new Map<string, AccessStatus>()
  if (viewerIsBuyer && row.asset !== null && viewer.buyerProfileId !== null) {
    const request = await prisma.accessRequest.findUnique({
      where: {
        assetId_buyerProfileId: { assetId: row.asset.id, buyerProfileId: viewer.buyerProfileId },
      },
      select: { status: true },
    })
    if (request) grantByAssetId.set(row.asset.id, request.status)
  }

  return {
    id: row.id,
    counterparty: viewerIsBuyer
      ? { side: 'SELLER', name: discloseSellerName(viewer, row, grantByAssetId) }
      : { side: 'BUYER', name: row.buyerProfile.displayName },
    asset: toAssetRef(row.asset),
    messages: row.messages.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      mine: message.senderUserId === viewer.userId,
    })),
    unreadCount: row.messages.filter((message) => isUnreadForViewer(message, viewer.userId)).length,
    canReply: canMessage(viewer, {
      userId: counterpartyUser.userId,
      status: counterpartyUser.user.status,
    }),
  }
}
