import { describe, expect, it } from 'vitest'
import {
  compareConversationsByActivity,
  isUnreadForViewer,
  participantConversationsWhere,
  unreadForViewerWhere,
  type ConversationSortKey,
} from '@/server/queries/conversation-where'
import type { Viewer } from '@/lib/authz'

const ME = 'usr-me'
const THEM = 'usr-them'

function viewer(overrides: Partial<Viewer> = {}): Viewer {
  return {
    userId: ME,
    email: 'me@n5deal.demo',
    role: 'BUYER',
    status: 'ACTIVE',
    buyerProfileId: 'byp-me',
    sellerProfileId: null,
    ...overrides,
  }
}

/**
 * The unread rule is written twice — once as a Prisma `where`, once as an
 * in-memory predicate — because the dashboards count in SQL and the thread
 * page counts over messages it already holds. These assert both encodings
 * against the same cases, so a change to one that is not made to the other
 * fails here rather than showing up as a dot that will not clear.
 */
describe('unreadForViewerWhere', () => {
  it('counts only unread messages somebody else sent', () => {
    expect(unreadForViewerWhere(ME)).toEqual({ readAt: null, senderUserId: { not: ME } })
  })

  it('excludes the viewer’s own messages, which are never stamped read', () => {
    // The regression this guards: `Message.readAt` is null on every message
    // from the moment it is written, so a bare `{ readAt: null }` reports a
    // viewer's own outbox back to them as unread mail.
    expect(unreadForViewerWhere(ME).senderUserId).toEqual({ not: ME })
  })
})

describe('isUnreadForViewer', () => {
  it('agrees with the SQL clause: unread and from the other party', () => {
    expect(isUnreadForViewer({ senderUserId: THEM, readAt: null }, ME)).toBe(true)
  })

  it('does not count a message the viewer sent', () => {
    expect(isUnreadForViewer({ senderUserId: ME, readAt: null }, ME)).toBe(false)
  })

  it('does not count a message already stamped read', () => {
    expect(isUnreadForViewer({ senderUserId: THEM, readAt: new Date() }, ME)).toBe(false)
  })
})

describe('participantConversationsWhere', () => {
  it('matches the threads a buyer is on', () => {
    expect(participantConversationsWhere(viewer())).toEqual({
      OR: [{ buyerProfileId: 'byp-me' }],
    })
  })

  it('matches the threads a seller is on', () => {
    const where = participantConversationsWhere(
      viewer({ role: 'SELLER', buyerProfileId: null, sellerProfileId: 'slp-me' }),
    )
    expect(where).toEqual({ OR: [{ sellerProfileId: 'slp-me' }] })
  })

  it('matches both sides for an account holding both profile rows', () => {
    const where = participantConversationsWhere(viewer({ sellerProfileId: 'slp-me' }))
    expect(where).toEqual({
      OR: [{ buyerProfileId: 'byp-me' }, { sellerProfileId: 'slp-me' }],
    })
  })

  /**
   * The highest-stakes case in this module. A manager holds neither profile
   * row; an empty `OR` is not "no threads" to Prisma, it matches *every*
   * row, which would hand a manager every private conversation on the
   * marketplace. `null` forces the caller to return early instead.
   */
  it('returns null — never an empty OR — for a viewer on neither side', () => {
    const manager = viewer({ role: 'MANAGER', buyerProfileId: null, sellerProfileId: null })
    expect(participantConversationsWhere(manager)).toBeNull()
  })
})

/** A thread as the comparator sees it: an id, a timestamp, and whether it is empty. */
function thread(
  id: string,
  lastMessageAt: string,
  hasMessages: boolean,
): ConversationSortKey {
  return { id, lastMessageAt: new Date(lastMessageAt), hasMessages }
}

const NEWER = '2026-09-06T12:00:00.000Z'
const OLDER = '2026-09-01T12:00:00.000Z'

describe('compareConversationsByActivity', () => {
  /**
   * The defect this comparator exists for. `Conversation.lastMessageAt`
   * defaults to `now()`, so a thread created by a bare click on "Contact
   * seller" is stamped with the present instant and outranks every real
   * negotiation until somebody writes in it — a content-free "No messages
   * yet." row at the top of both inboxes.
   */
  it('ranks a thread with messages above an empty one, however fresh the empty one is', () => {
    const empty = thread('cnv-empty', NEWER, false)
    const active = thread('cnv-active', OLDER, true)
    expect([empty, active].sort(compareConversationsByActivity)).toEqual([active, empty])
  })

  it('orders threads that have messages by recency, newest first', () => {
    const older = thread('cnv-a', OLDER, true)
    const newer = thread('cnv-b', NEWER, true)
    expect([older, newer].sort(compareConversationsByActivity)).toEqual([newer, older])
  })

  it('orders empty threads among themselves by recency too', () => {
    const older = thread('cnv-a', OLDER, false)
    const newer = thread('cnv-b', NEWER, false)
    expect([older, newer].sort(compareConversationsByActivity)).toEqual([newer, older])
  })

  /**
   * Every sort in this codebase ends in `id` ascending
   * (`compareBuyersByRecency`, `SORT_ORDER`) so that it is a *total* order:
   * two threads bumped in the same millisecond — one `sendMessage` racing
   * another — must not swap places between two renders of the same page.
   */
  it('breaks a same-instant tie on id ascending, in both groups', () => {
    const b = thread('cnv-b', NEWER, true)
    const a = thread('cnv-a', NEWER, true)
    expect([b, a].sort(compareConversationsByActivity)).toEqual([a, b])

    const emptyB = thread('cnv-b', NEWER, false)
    const emptyA = thread('cnv-a', NEWER, false)
    expect([emptyB, emptyA].sort(compareConversationsByActivity)).toEqual([emptyA, emptyB])
  })

  it('compares two entries with identical keys as equal', () => {
    expect(compareConversationsByActivity(thread('cnv-a', NEWER, true), thread('cnv-a', NEWER, true))).toBe(0)
  })

  /**
   * The whole ordering at once, from an input deliberately shuffled out of
   * every key's order, so a comparator that happened to be right about one
   * pair and wrong about another cannot pass.
   */
  it('produces the same order regardless of the order it is given', () => {
    const rows = [
      thread('cnv-empty-new', NEWER, false),
      thread('cnv-active-old', OLDER, true),
      thread('cnv-empty-old', OLDER, false),
      thread('cnv-active-new', NEWER, true),
    ]
    const expected = ['cnv-active-new', 'cnv-active-old', 'cnv-empty-new', 'cnv-empty-old']

    expect([...rows].sort(compareConversationsByActivity).map((row) => row.id)).toEqual(expected)
    expect([...rows].reverse().sort(compareConversationsByActivity).map((row) => row.id)).toEqual(expected)
  })
})
