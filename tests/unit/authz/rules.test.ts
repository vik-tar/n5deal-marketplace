import { describe, expect, it } from 'vitest'
import {
  canDecideAccess,
  canEditAsset,
  canMessage,
  canModerate,
  canRequestAccess,
  canViewAsset,
  canViewFullAsset,
} from '@/lib/authz'
import type { AssetRef, Viewer } from '@/lib/authz'

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

const otherSeller: Viewer = { ...seller, userId: 'u-seller-2', sellerProfileId: 'sp-2' }
const manager: Viewer = {
  userId: 'u-manager',
  email: 'manager@example.com',
  role: 'MANAGER',
  status: 'ACTIVE',
  buyerProfileId: null,
  sellerProfileId: null,
}

const published: AssetRef = {
  id: 'a-1',
  sellerProfileId: 'sp-1',
  status: 'PUBLISHED',
  ownerStatus: 'ACTIVE',
}
const draft: AssetRef = { ...published, status: 'DRAFT' }
const ownerSuspended: AssetRef = { ...published, ownerStatus: 'SUSPENDED' }

describe('canViewAsset', () => {
  it('lets anonymous visitors see published listings', () => {
    expect(canViewAsset(null, published)).toBe(true)
  })

  it('hides drafts from anonymous visitors', () => {
    expect(canViewAsset(null, draft)).toBe(false)
  })

  it('hides listings whose owner is suspended', () => {
    expect(canViewAsset(buyer, ownerSuspended)).toBe(false)
  })

  it('still shows a suspended owner their own listing to the manager', () => {
    expect(canViewAsset(manager, ownerSuspended)).toBe(true)
  })

  it('shows a seller their own draft', () => {
    expect(canViewAsset(seller, draft)).toBe(true)
  })

  it("hides another seller's draft", () => {
    expect(canViewAsset(otherSeller, draft)).toBe(false)
  })

  it('locks out a suspended viewer entirely', () => {
    expect(canViewAsset({ ...buyer, status: 'SUSPENDED' }, published)).toBe(false)
  })
})

describe('canViewFullAsset', () => {
  it('withholds confidential data from a buyer without a grant', () => {
    expect(canViewFullAsset(buyer, published, 'NONE')).toBe(false)
  })

  it('withholds it while the request is still pending', () => {
    expect(canViewFullAsset(buyer, published, 'REQUESTED')).toBe(false)
  })

  it('releases it once the grant is approved', () => {
    expect(canViewFullAsset(buyer, published, 'APPROVED')).toBe(true)
  })

  it('withholds it again after the grant is revoked', () => {
    expect(canViewFullAsset(buyer, published, 'REVOKED')).toBe(false)
  })

  it('always shows the owning seller their own confidential data', () => {
    expect(canViewFullAsset(seller, published, 'NONE')).toBe(true)
  })

  it('always shows the manager', () => {
    expect(canViewFullAsset(manager, published, 'NONE')).toBe(true)
  })

  it('withholds it from a suspended buyer holding an approved grant', () => {
    expect(canViewFullAsset({ ...buyer, status: 'SUSPENDED' }, published, 'APPROVED')).toBe(
      false,
    )
  })
})

describe('canEditAsset', () => {
  it('allows the owner', () => {
    expect(canEditAsset(seller, draft)).toBe(true)
  })

  it('denies another seller', () => {
    expect(canEditAsset(otherSeller, draft)).toBe(false)
  })

  it('denies the manager, who moderates rather than edits', () => {
    expect(canEditAsset(manager, draft)).toBe(false)
  })

  it('denies editing a sold listing', () => {
    expect(canEditAsset(seller, { ...published, status: 'SOLD' })).toBe(false)
  })
})

describe('canRequestAccess', () => {
  it('allows an active buyer with no prior request', () => {
    expect(canRequestAccess(buyer, published, 'NONE')).toBe(true)
  })

  it('denies a second request while one is pending', () => {
    expect(canRequestAccess(buyer, published, 'REQUESTED')).toBe(false)
  })

  it('treats a declined request as final', () => {
    expect(canRequestAccess(buyer, published, 'DECLINED')).toBe(false)
  })

  it('denies sellers, who buy nothing', () => {
    expect(canRequestAccess(seller, { ...published, sellerProfileId: 'sp-9' }, 'NONE')).toBe(
      false,
    )
  })

  it('denies requests against unpublished listings', () => {
    expect(canRequestAccess(buyer, draft, 'NONE')).toBe(false)
  })
})

describe('canDecideAccess', () => {
  it('allows only the owning seller', () => {
    expect(canDecideAccess(seller, published)).toBe(true)
    expect(canDecideAccess(otherSeller, published)).toBe(false)
    expect(canDecideAccess(manager, published)).toBe(false)
  })
})

describe('canModerate and canMessage', () => {
  it('restricts moderation to active managers', () => {
    expect(canModerate(manager)).toBe(true)
    expect(canModerate({ ...manager, status: 'SUSPENDED' })).toBe(false)
    expect(canModerate(seller)).toBe(false)
    expect(canModerate(null)).toBe(false)
  })

  it('blocks messaging a suspended counterparty', () => {
    expect(canMessage(buyer, 'ACTIVE')).toBe(true)
    expect(canMessage(buyer, 'SUSPENDED')).toBe(false)
    expect(canMessage({ ...buyer, status: 'REMOVED' }, 'ACTIVE')).toBe(false)
    expect(canMessage(manager, 'ACTIVE')).toBe(false)
  })
})
