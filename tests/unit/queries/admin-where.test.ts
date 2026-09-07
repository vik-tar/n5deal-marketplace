import { describe, expect, it } from 'vitest'
import {
  ADMIN_ASSET_STATUS_ORDER,
  ADMIN_USER_STATUS_ORDER,
  LISTING_TRANSITIONS,
  MODERATION_LOG_LIMIT,
  USER_TRANSITIONS,
  assertCanModerate,
  buildAdminAssetWhere,
  buildParticipantWhere,
  compareAdminAssets,
  compareParticipants,
  type AdminAssetSortKey,
  type ParticipantSortKey,
} from '@/server/queries/admin-where'
import { parseAdminFilters, type AdminFilters } from '@/lib/filters/admin-filters'
import type { Viewer } from '@/lib/authz'

/** `parseAdminFilters({})` gives the exact default shape; overrides layer on top. */
function makeFilters(overrides: Partial<AdminFilters> = {}): AdminFilters {
  return { ...parseAdminFilters({}), ...overrides }
}

const manager: Viewer = {
  userId: 'u-manager',
  email: 'manager@example.com',
  role: 'MANAGER',
  status: 'ACTIVE',
  buyerProfileId: null,
  sellerProfileId: null,
}

const buyer: Viewer = {
  userId: 'u-buyer',
  email: 'buyer@example.com',
  role: 'BUYER',
  status: 'ACTIVE',
  buyerProfileId: 'bp-1',
  sellerProfileId: null,
}

const seller: Viewer = {
  userId: 'u-seller',
  email: 'seller@example.com',
  role: 'SELLER',
  status: 'ACTIVE',
  buyerProfileId: null,
  sellerProfileId: 'sp-1',
}

/**
 * The console's guard is the one authorization check in this codebase that
 * *throws* instead of returning an empty result, and the reasoning for the
 * difference is on the function itself. Unlike the per-row `canViewAsset`
 * check Task 12 deleted from `listAssets` — which could not fail, because it
 * was fed a hardcoded `ownerStatus` — this one is called with the real viewer
 * and every non-manager shape reaches the throw. All four are asserted here,
 * because a guard that is never exercised is exactly how that dead check
 * survived three tasks.
 */
describe('assertCanModerate', () => {
  it('lets an active manager through', () => {
    expect(() => assertCanModerate(manager)).not.toThrow()
  })

  it('throws FORBIDDEN for every non-manager viewer shape', () => {
    const refused: Array<[string, Viewer | null]> = [
      ['anonymous', null],
      ['buyer', buyer],
      ['seller', seller],
      ['suspended manager', { ...manager, status: 'SUSPENDED' }],
      ['removed manager', { ...manager, status: 'REMOVED' }],
    ]
    for (const [name, viewer] of refused) {
      expect(() => assertCanModerate(viewer), name).toThrowError('FORBIDDEN')
    }
  })
})

/**
 * The console is the only surface in the application with no visibility
 * floor, and that absence is load-bearing: a manager cannot reinstate an
 * account or review a pending listing they cannot see. These assert the
 * absence directly, so that "somebody helpfully adds a floor" is a failing
 * test rather than a console that quietly stops showing the rows it exists
 * for.
 */
describe('buildParticipantWhere', () => {
  it('filters nothing at all by default — suspended and removed accounts included', () => {
    expect(buildParticipantWhere(makeFilters())).toEqual({})
  })

  it('adds the role condition only when roles are set', () => {
    expect(buildParticipantWhere(makeFilters()).role).toBeUndefined()
    expect(buildParticipantWhere(makeFilters({ roles: ['SELLER', 'MANAGER'] })).role).toEqual({
      in: ['SELLER', 'MANAGER'],
    })
  })

  it('adds the status condition only when statuses are set', () => {
    expect(buildParticipantWhere(makeFilters()).status).toBeUndefined()
    expect(buildParticipantWhere(makeFilters({ userStatuses: ['REMOVED'] })).status).toEqual({
      in: ['REMOVED'],
    })
  })

  it('searches email and both display names, case-insensitively', () => {
    expect(buildParticipantWhere(makeFilters()).OR).toBeUndefined()
    expect(buildParticipantWhere(makeFilters({ q: 'baltic' })).OR).toEqual([
      { email: { contains: 'baltic', mode: 'insensitive' } },
      { buyerProfile: { displayName: { contains: 'baltic', mode: 'insensitive' } } },
      { sellerProfile: { companyName: { contains: 'baltic', mode: 'insensitive' } } },
    ])
  })

  it('never constrains status when only the search text is set', () => {
    const where = buildParticipantWhere(makeFilters({ q: 'quicklicence' }))
    expect(where.status).toBeUndefined()
    expect(where.role).toBeUndefined()
  })
})

describe('buildAdminAssetWhere', () => {
  it('filters nothing by default — drafts, rejections and suspended sellers included', () => {
    expect(buildAdminAssetWhere(makeFilters())).toEqual({})
  })

  it('filters to exactly the selected statuses', () => {
    expect(buildAdminAssetWhere(makeFilters({ assetStatuses: ['PENDING_REVIEW'] }))).toEqual({
      status: { in: ['PENDING_REVIEW'] },
    })
  })

  it('never adds a seller-status condition, which would hide the rows the console exists for', () => {
    const where = buildAdminAssetWhere(makeFilters({ assetStatuses: ['PUBLISHED'] }))
    expect(where.sellerProfile).toBeUndefined()
  })
})

describe('compareAdminAssets', () => {
  const at = (iso: string) => new Date(iso)

  it('puts the review queue first, whatever the dates say', () => {
    const pendingOld: AdminAssetSortKey = {
      id: 'a',
      status: 'PENDING_REVIEW',
      updatedAt: at('2020-01-01T00:00:00Z'),
    }
    const publishedNew: AdminAssetSortKey = {
      id: 'b',
      status: 'PUBLISHED',
      updatedAt: at('2030-01-01T00:00:00Z'),
    }
    expect([publishedNew, pendingOld].sort(compareAdminAssets).map((row) => row.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('orders whole statuses in ADMIN_ASSET_STATUS_ORDER', () => {
    const rows: AdminAssetSortKey[] = ADMIN_ASSET_STATUS_ORDER.map((status, index) => ({
      id: `id-${index}`,
      status,
      updatedAt: at('2026-01-01T00:00:00Z'),
    }))
    const shuffled = [...rows].reverse()
    expect(shuffled.sort(compareAdminAssets).map((row) => row.status)).toEqual([
      ...ADMIN_ASSET_STATUS_ORDER,
    ])
  })

  it('breaks a status tie on the most recently changed row', () => {
    const older: AdminAssetSortKey = {
      id: 'a',
      status: 'PUBLISHED',
      updatedAt: at('2026-01-01T00:00:00Z'),
    }
    const newer: AdminAssetSortKey = {
      id: 'b',
      status: 'PUBLISHED',
      updatedAt: at('2026-06-01T00:00:00Z'),
    }
    expect([older, newer].sort(compareAdminAssets).map((row) => row.id)).toEqual(['b', 'a'])
  })

  /**
   * A total order, so no two distinct rows compare equal and the table cannot
   * reshuffle between renders — the requirement every comparator in this
   * codebase carries.
   */
  it('is a total order: identical status and timestamp fall through to id', () => {
    const same = { status: 'SOLD' as const, updatedAt: at('2026-01-01T00:00:00Z') }
    expect(compareAdminAssets({ id: 'a', ...same }, { id: 'b', ...same })).toBeLessThan(0)
    expect(compareAdminAssets({ id: 'b', ...same }, { id: 'a', ...same })).toBeGreaterThan(0)
    expect(compareAdminAssets({ id: 'a', ...same }, { id: 'a', ...same })).toBe(0)
  })
})

describe('compareParticipants', () => {
  const account = (
    userId: string,
    status: ParticipantSortKey['status'],
    email: string,
  ): ParticipantSortKey => ({ userId, status, email })

  it('puts suspended accounts first and removed ones last', () => {
    const rows = [
      account('u1', 'REMOVED', 'a@example.com'),
      account('u2', 'ACTIVE', 'b@example.com'),
      account('u3', 'SUSPENDED', 'c@example.com'),
    ]
    expect(rows.sort(compareParticipants).map((row) => row.status)).toEqual([
      ...ADMIN_USER_STATUS_ORDER,
    ])
  })

  it('orders alphabetically by email inside a status group', () => {
    const rows = [
      account('u1', 'ACTIVE', 'zoe@example.com'),
      account('u2', 'ACTIVE', 'adam@example.com'),
      account('u3', 'ACTIVE', 'mary@example.com'),
    ]
    expect(rows.sort(compareParticipants).map((row) => row.email)).toEqual([
      'adam@example.com',
      'mary@example.com',
      'zoe@example.com',
    ])
  })

  it('is a total order: identical status and email fall through to userId', () => {
    const same = { status: 'ACTIVE' as const, email: 'same@example.com' }
    expect(compareParticipants({ userId: 'a', ...same }, { userId: 'b', ...same })).toBeLessThan(0)
    expect(compareParticipants({ userId: 'a', ...same }, { userId: 'a', ...same })).toBe(0)
  })
})

/**
 * The transitions are the rules the conditional `updateMany`s in
 * `@/server/actions/moderation` are written from, so they are asserted as
 * values rather than through the actions — which cannot be reached without a
 * database.
 */
describe('USER_TRANSITIONS', () => {
  it('suspends only an active account', () => {
    expect(USER_TRANSITIONS.SUSPEND).toEqual({ from: ['ACTIVE'], to: 'SUSPENDED' })
  })

  it('reinstates a suspended or a removed account, because the delete is soft', () => {
    expect(USER_TRANSITIONS.REINSTATE.to).toBe('ACTIVE')
    expect([...USER_TRANSITIONS.REINSTATE.from].sort()).toEqual(['REMOVED', 'SUSPENDED'])
  })

  it('removes an account that is not already removed', () => {
    expect(USER_TRANSITIONS.REMOVE.to).toBe('REMOVED')
    expect(USER_TRANSITIONS.REMOVE.from).not.toContain('REMOVED')
  })

  it('never lets a transition start from the status it produces', () => {
    for (const [action, transition] of Object.entries(USER_TRANSITIONS)) {
      expect(transition.from, action).not.toContain(transition.to)
    }
  })
})

describe('LISTING_TRANSITIONS', () => {
  /**
   * The membership is asserted exactly, the way `USER_TRANSITIONS.REINSTATE`
   * above does it, rather than with a `toContain` per member: a `toContain`
   * pair defends only the positive half of the rule. It stays green if
   * `'DRAFT'` or `'SOLD'` is added to `APPROVE.from` — and "approve only out
   * of the queue or out of a takedown" is a claim about what is *not* in that
   * list at least as much as about what is.
   */
  it('approves out of the queue or a takedown, and rejects only out of the queue', () => {
    expect(LISTING_TRANSITIONS.APPROVE.to).toBe('PUBLISHED')
    expect([...LISTING_TRANSITIONS.APPROVE.from].sort()).toEqual(['PENDING_REVIEW', 'SUSPENDED'])
    expect(LISTING_TRANSITIONS.REJECT).toEqual({ from: ['PENDING_REVIEW'], to: 'REJECTED' })
  })

  it('suspends only a published listing', () => {
    expect(LISTING_TRANSITIONS.SUSPEND).toEqual({ from: ['PUBLISHED'], to: 'SUSPENDED' })
  })

  /**
   * The regression this table shipped with: `SUSPEND` produced a status no
   * other transition accepted, and no other writer in the application accepts
   * it either (`submitForReview` takes `DRAFT`/`REJECTED`, `saveDraft` leaves
   * a non-`PUBLISHED` status alone, nothing deletes a listing), so a takedown
   * could be undone only in the database. Asserted through `SUSPEND.to`
   * rather than the literal `'SUSPENDED'` so that renaming the status cannot
   * quietly re-open the trap.
   */
  it('takes a suspended listing back into the catalog, so a takedown is reversible', () => {
    expect(LISTING_TRANSITIONS.APPROVE.from).toContain(LISTING_TRANSITIONS.SUSPEND.to)
    expect(LISTING_TRANSITIONS.APPROVE.to).toBe(LISTING_TRANSITIONS.SUSPEND.from[0])
  })

  it('never lets a transition start from the status it produces', () => {
    for (const [action, transition] of Object.entries(LISTING_TRANSITIONS)) {
      expect(transition.from, action).not.toContain(transition.to)
    }
  })
})

describe('MODERATION_LOG_LIMIT', () => {
  it('bounds the log read', () => {
    expect(MODERATION_LOG_LIMIT).toBeGreaterThan(0)
    expect(Number.isSafeInteger(MODERATION_LOG_LIMIT)).toBe(true)
  })
})
