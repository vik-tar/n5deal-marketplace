import type { Prisma } from '@/generated/prisma/client'
import type { Viewer } from '@/lib/authz'

/**
 * Pure query-shape logic for messaging, kept out of `conversations.ts` for
 * the reason `asset-where.ts` and `buyer-where.ts` document at length: this
 * module imports only *types* from the generated Prisma client (`import
 * type`, erased at compile time) and never `@/server/db`, which constructs a
 * client eagerly at module load and fails fast without `DATABASE_URL`. Every
 * rule here is therefore testable as ordinary pure logic, with no database,
 * no connection string and no environment.
 */

/**
 * "Unread", as this whole application defines it: a message somebody *else*
 * sent me that nobody has stamped `readAt` on yet.
 *
 * Excluding the viewer's own messages is not a refinement, it is the whole
 * rule. `Message.readAt` is null from the moment a message is written —
 * including on the ones the viewer just sent — so a bare `readAt: null`
 * count reports a viewer's own outbox back to them as unread mail.
 *
 * Five call sites need the identical clause — the two dashboard overviews
 * (`getBuyerOverview`, `@/server/queries/buyers`, and `getSellerOverview`,
 * `@/server/queries/assets`), the per-thread count on `/inbox`, the thread
 * page's own count, and `markRead` (`@/server/actions/messages`), whose
 * `where` must select exactly the rows the counts were counting or the dot
 * would not clear. Held once so it cannot drift between the count and the
 * clear.
 * Five copies of one definition is five chances for them to drift, so the
 * rule is written once, here, and every one of those five reads it from this
 * module. Four import this `where` fragment directly; the thread page
 * (`getConversation`, `@/server/queries/conversations`) has the messages in
 * hand rather than a query to build, so it calls `isUnreadForViewer` below —
 * the same predicate in row form, defined immediately underneath so the two
 * cannot answer differently.
 */
export function unreadForViewerWhere(viewerUserId: string): Prisma.MessageWhereInput {
  return { readAt: null, senderUserId: { not: viewerUserId } }
}

/**
 * The same rule as `unreadForViewerWhere`, applied to a message already in
 * memory rather than compiled into SQL — the thread page has every message
 * loaded and must not issue a second query to learn how many of them are
 * unread.
 *
 * These two are two encodings of one rule and must change together; the test
 * (`tests/unit/queries/conversation-where.test.ts`) asserts them against the
 * same fixtures for exactly that reason.
 */
export function isUnreadForViewer(
  message: { senderUserId: string; readAt: Date | null },
  viewerUserId: string,
): boolean {
  return message.readAt === null && message.senderUserId !== viewerUserId
}

/**
 * The conversations a viewer participates in — and `null` for a viewer who
 * participates in none, which is a different answer from "an empty filter".
 *
 * A `Conversation` names its two parties by *profile* id, not by user id, so
 * participation is exactly "one of my profile rows is on this thread". A
 * `MANAGER` holds neither a `BuyerProfile` nor a `SellerProfile`, so this
 * returns `null` for them rather than a `{ OR: [] }` — which Prisma treats
 * as matching *everything*, and would hand a manager every private thread on
 * the marketplace. The null is what makes the caller's early return
 * unmissable instead of accidental.
 */
export function participantConversationsWhere(viewer: Viewer): Prisma.ConversationWhereInput | null {
  const sides: Prisma.ConversationWhereInput[] = []
  if (viewer.buyerProfileId !== null) sides.push({ buyerProfileId: viewer.buyerProfileId })
  if (viewer.sellerProfileId !== null) sides.push({ sellerProfileId: viewer.sellerProfileId })
  if (sides.length === 0) return null
  return { OR: sides }
}

/**
 * The deterministic order `listConversations` reads threads in before it
 * sorts them, and the reason it can sort them at all: `{ id: 'asc' }` is the
 * total-order tail every read in this codebase carries (see
 * `BUYER_SORT_ORDER`, `@/server/queries/buyer-where`, and `SORT_ORDER`,
 * `@/server/queries/asset-where`), because Postgres guarantees no stable
 * order for rows that tie on every earlier key.
 */
export const CONVERSATION_SORT_ORDER = [
  { lastMessageAt: 'desc' },
  { id: 'asc' },
] as const satisfies Prisma.ConversationOrderByWithRelationInput[]

/** The minimum shape `compareConversationsByActivity` needs to place a thread. */
export interface ConversationSortKey {
  id: string
  lastMessageAt: Date
  /** Whether anybody has written in this thread yet. */
  hasMessages: boolean
}

/**
 * The inbox order: threads somebody has actually written in first, then
 * `lastMessageAt` descending inside each group, then `id` ascending.
 *
 * The leading `hasMessages` key is the fix for a real defect. `Conversation.
 * lastMessageAt` carries `@default(now())`, so a thread is born stamped with
 * the present instant and outranks every real conversation on the marketplace
 * from the moment it is created — and `startConversation`
 * (`@/server/actions/messages`) creates one on a bare click of "Contact
 * seller", before a single word is written. The observed symptom was a
 * content-free "No messages yet." row sitting at the top of both parties'
 * inboxes, above threads with live negotiations in them.
 *
 * Fixing it in the ordering rather than by refusing to create the thread is
 * deliberate. The contact buttons navigate to `/inbox/[id]` and need a row to
 * navigate *to*; an empty thread renders correctly on both sides already; and
 * `startConversation` is idempotent on `threadKey` precisely so that clicking
 * twice lands in the same place. Deferring creation until the first message
 * would mean inventing a second creation path and a draft state for a thread
 * that does not exist yet.
 *
 * The other rejected fix was backdating `lastMessageAt` to the epoch on
 * create. It sorts identically, but it puts a lie in the column — a timestamp
 * no event ever produced — and `/inbox` renders that column as the row's date.
 *
 * `hasMessages` is compared before recency rather than folded into it because
 * the two are answering different questions: "is there anything here" ranks
 * above "how recent is it". Within the empty group `lastMessageAt` still
 * orders by creation time, which is the only signal such a thread has, and
 * `id` ascending closes the sort as a total order so no two distinct threads
 * can ever compare equal — the same requirement `compareBuyersByRecency` and
 * `compareBuyersByScore` document.
 */
export function compareConversationsByActivity(a: ConversationSortKey, b: ConversationSortKey): number {
  if (a.hasMessages !== b.hasMessages) return a.hasMessages ? -1 : 1
  const byRecency = b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
  if (byRecency !== 0) return byRecency
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
