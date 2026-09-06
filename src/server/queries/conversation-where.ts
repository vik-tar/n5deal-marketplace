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
 * This existed twice before Task 19 (inline in `getBuyerOverview`,
 * `@/server/queries/buyers`, and in `getSellerOverview`,
 * `@/server/queries/assets`) and Task 19 needed it in three more places —
 * the per-thread count on `/inbox`, the thread page's own count, and
 * `markRead` (`@/server/actions/messages`), whose `where` must select
 * exactly the rows the counts were counting or the dot would not clear.
 * Five copies of one definition is five chances for them to drift, so it is
 * extracted here and imported by all five.
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
