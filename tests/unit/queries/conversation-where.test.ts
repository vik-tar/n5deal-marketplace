import { describe, expect, it } from 'vitest'
import {
  isUnreadForViewer,
  participantConversationsWhere,
  unreadForViewerWhere,
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
