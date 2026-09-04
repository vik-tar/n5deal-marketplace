import { describe, expect, it } from 'vitest'
import { mapGrantState, selectGateStatus } from '@/lib/gate'
import { canRequestAccess, canViewAsset, canViewFullAsset } from '@/lib/authz'
import type { AssetRef, Viewer } from '@/lib/authz'

describe('mapGrantState', () => {
  it('maps a missing row to NONE', () => {
    expect(mapGrantState(null)).toBe('NONE')
  })

  it('carries an existing status over unchanged', () => {
    expect(mapGrantState('REQUESTED')).toBe('REQUESTED')
    expect(mapGrantState('APPROVED')).toBe('APPROVED')
    expect(mapGrantState('DECLINED')).toBe('DECLINED')
    expect(mapGrantState('REVOKED')).toBe('REVOKED')
  })
})

describe('selectGateStatus', () => {
  it('is OPEN whenever the DTO is full, regardless of grant or canRequest', () => {
    expect(
      selectGateStatus({ isFullAsset: true, grant: 'NONE', canRequest: false, requestStillEligible: false }),
    ).toBe('OPEN')
    expect(
      selectGateStatus({
        isFullAsset: true,
        grant: 'DECLINED',
        canRequest: false,
        requestStillEligible: false,
      }),
    ).toBe('OPEN')
  })

  it('is PENDING when the grant is REQUESTED and still eligible, even if canRequest were somehow true', () => {
    expect(
      selectGateStatus({
        isFullAsset: false,
        grant: 'REQUESTED',
        canRequest: false,
        requestStillEligible: true,
      }),
    ).toBe('PENDING')
    expect(
      selectGateStatus({
        isFullAsset: false,
        grant: 'REQUESTED',
        canRequest: true,
        requestStillEligible: true,
      }),
    ).toBe('PENDING')
  })

  it('is REQUESTABLE when the caller says the viewer can request access', () => {
    expect(
      selectGateStatus({ isFullAsset: false, grant: 'NONE', canRequest: true, requestStillEligible: false }),
    ).toBe('REQUESTABLE')
  })

  it('is CLOSED for an anonymous visitor (grant NONE, canRequest false)', () => {
    expect(
      selectGateStatus({
        isFullAsset: false,
        grant: 'NONE',
        canRequest: false,
        requestStillEligible: false,
      }),
    ).toBe('CLOSED')
  })

  it('is CLOSED for a declined or revoked grant', () => {
    expect(
      selectGateStatus({
        isFullAsset: false,
        grant: 'DECLINED',
        canRequest: false,
        requestStillEligible: false,
      }),
    ).toBe('CLOSED')
    expect(
      selectGateStatus({
        isFullAsset: false,
        grant: 'REVOKED',
        canRequest: false,
        requestStillEligible: false,
      }),
    ).toBe('CLOSED')
  })

  describe('the stale-grant defect (a REQUESTED grant whose eligibility no longer holds)', () => {
    it('is CLOSED, not PENDING, when the listing has since left PUBLISHED (e.g. SOLD)', () => {
      // The signal fed here is exactly what `getAssetDetail` computes:
      // `canRequestAccess(viewer, ref, 'NONE')` on the *current* asset row —
      // which is false once `ref.status !== 'PUBLISHED'`, regardless of the
      // real (stale) grant still being `'REQUESTED'`.
      expect(
        selectGateStatus({
          isFullAsset: false,
          grant: 'REQUESTED',
          canRequest: false,
          requestStillEligible: false,
        }),
      ).toBe('CLOSED')
    })

    it('is CLOSED, not PENDING, when the requesting buyer was suspended after requesting', () => {
      // Same signal, same reason: `canRequestAccess(viewer, ref, 'NONE')` is
      // false once `isActive(viewer)` is false, independent of the stale
      // `'REQUESTED'` row.
      expect(
        selectGateStatus({
          isFullAsset: false,
          grant: 'REQUESTED',
          canRequest: false,
          requestStillEligible: false,
        }),
      ).toBe('CLOSED')
    })
  })
})

describe('the full pipeline for a suspended viewer', () => {
  /**
   * Not a synthetic input combination — this composes the real `@/lib/authz`
   * predicates (as `getAssetDetail` does) with `selectGateStatus`, on a
   * suspended buyer, to prove the whole pipeline lands on `'CLOSED'` in
   * parity with an anonymous visitor. `canViewAsset` itself now returns
   * `true` for this viewer (a suspended account still sees the public
   * teaser, per the ruling that landed in `src/lib/authz/rules.ts`), so the
   * thing actually worth proving is that nothing beyond the teaser opens up:
   * no confidential data, no ability to request it, and therefore no gate
   * state other than closed.
   */
  it('renders CLOSED, not an error, for a suspended buyer on a published listing', () => {
    const suspendedBuyer: Viewer = {
      userId: 'u-suspended-buyer',
      email: 'suspended@example.com',
      role: 'BUYER',
      status: 'SUSPENDED',
      buyerProfileId: 'bp-1',
      sellerProfileId: null,
    }
    const published: AssetRef = {
      id: 'a-1',
      sellerProfileId: 'sp-1',
      status: 'PUBLISHED',
      ownerStatus: 'ACTIVE',
    }

    // The teaser itself is visible — this viewer is not 404'd off a public URL.
    expect(canViewAsset(suspendedBuyer, published)).toBe(true)

    const grant = mapGrantState(null)
    const isFullAsset = canViewFullAsset(suspendedBuyer, published, grant)
    const canRequest = canRequestAccess(suspendedBuyer, published, grant)
    const requestStillEligible = canRequestAccess(suspendedBuyer, published, 'NONE')

    expect(isFullAsset).toBe(false)
    expect(canRequest).toBe(false)
    expect(selectGateStatus({ isFullAsset, grant, canRequest, requestStillEligible })).toBe('CLOSED')
  })

  /**
   * The stale-grant fix, run through the real predicates rather than
   * synthetic booleans: a buyer who requested access while active, then was
   * suspended, still has a `'REQUESTED'` row (nothing about the row itself
   * changed) — the fix must come from re-checking the *viewer*, not the
   * grant.
   */
  it('renders CLOSED, not PENDING, for a REQUESTED grant whose buyer was suspended after requesting', () => {
    const nowSuspendedBuyer: Viewer = {
      userId: 'u-buyer-suspended-after-requesting',
      email: 'was-active@example.com',
      role: 'BUYER',
      status: 'SUSPENDED',
      buyerProfileId: 'bp-2',
      sellerProfileId: null,
    }
    const published: AssetRef = {
      id: 'a-2',
      sellerProfileId: 'sp-1',
      status: 'PUBLISHED',
      ownerStatus: 'ACTIVE',
    }

    const grant = mapGrantState('REQUESTED')
    const isFullAsset = canViewFullAsset(nowSuspendedBuyer, published, grant)
    const canRequest = canRequestAccess(nowSuspendedBuyer, published, grant)
    const requestStillEligible = canRequestAccess(nowSuspendedBuyer, published, 'NONE')

    expect(requestStillEligible).toBe(false)
    expect(selectGateStatus({ isFullAsset, grant, canRequest, requestStillEligible })).toBe('CLOSED')
  })

  /**
   * The other half of the same defect: the buyer is still active, but the
   * listing they requested access to has since moved off `PUBLISHED`
   * (sold, suspended, whatever) — the grant row is still `'REQUESTED'`
   * (nothing decided it), yet it can no longer proceed.
   */
  it('renders CLOSED, not PENDING, for a REQUESTED grant on a listing since marked SOLD', () => {
    const activeBuyer: Viewer = {
      userId: 'u-buyer-still-active',
      email: 'still-active@example.com',
      role: 'BUYER',
      status: 'ACTIVE',
      buyerProfileId: 'bp-3',
      sellerProfileId: null,
    }
    const soldAsset: AssetRef = {
      id: 'a-3',
      sellerProfileId: 'sp-1',
      status: 'SOLD',
      ownerStatus: 'ACTIVE',
    }

    const grant = mapGrantState('REQUESTED')
    const isFullAsset = canViewFullAsset(activeBuyer, soldAsset, grant)
    const canRequest = canRequestAccess(activeBuyer, soldAsset, grant)
    const requestStillEligible = canRequestAccess(activeBuyer, soldAsset, 'NONE')

    expect(requestStillEligible).toBe(false)
    expect(selectGateStatus({ isFullAsset, grant, canRequest, requestStillEligible })).toBe('CLOSED')
  })
})
