import { describe, expect, it } from 'vitest'
import {
  assetStatusAllowsEditing,
  canBrowseBuyers,
  canDecideAccess,
  canEditAsset,
  canMessage,
  canModerate,
  canModerateUser,
  canPublishListing,
  canRequestAccess,
  canRevokeAccess,
  canViewAsset,
  canViewFullAsset,
  contactAvailability,
  statusAllowsAuthenticatedSurfaces,
  viewerGate,
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
const sold: AssetRef = { ...published, status: 'SOLD' }
const suspendedListing: AssetRef = { ...published, status: 'SUSPENDED' }
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

  it('shows a suspended viewer exactly the public teaser an anonymous visitor sees, and nothing more', () => {
    const suspendedBuyer: Viewer = { ...buyer, status: 'SUSPENDED' }
    // Suspension bars transacting, not looking: the teaser is visible on both
    // public statuses, matching what an anonymous visitor sees (and matching
    // the catalog's own viewer-status-blind visibility floor — see
    // `tests/unit/queries/asset-where.test.ts`).
    expect(canViewAsset(suspendedBuyer, published)).toBe(true)
    expect(canViewAsset(suspendedBuyer, sold)).toBe(true)
    // But nothing beyond the teaser opens up: no confidential data, and no
    // ability to request it.
    expect(canViewFullAsset(suspendedBuyer, published, 'NONE')).toBe(false)
    expect(canRequestAccess(suspendedBuyer, published, 'NONE')).toBe(false)
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

  /**
   * The two cases below are the only ones in this file that exercise the
   * `&& canViewAsset(viewer, asset)` conjunct. Every other `false` here is
   * already decided by an earlier line of the predicate, and every `true`
   * uses a `PUBLISHED` listing with an `ACTIVE` owner — so before these
   * existed, deleting that conjunct left all 355 tests green while
   * `discloseSellerName` (`@/server/queries/conversations`), where it is the
   * whole gate, began printing the seller's `companyName` in every thread
   * about a taken-down listing. An approved grant is not revoked by a
   * takedown; it simply stops meaning anything, and that is what these
   * assert.
   */
  it('withholds it once the listing itself is suspended, even on an approved grant', () => {
    expect(canViewFullAsset(buyer, suspendedListing, 'APPROVED')).toBe(false)
  })

  it("withholds it once the listing's seller is suspended, even on an approved grant", () => {
    expect(canViewFullAsset(buyer, ownerSuspended, 'APPROVED')).toBe(false)
  })
})

describe('assetStatusAllowsEditing', () => {
  it('refuses only SOLD', () => {
    expect(assetStatusAllowsEditing('SOLD')).toBe(false)
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'SUSPENDED'] as const) {
      expect(assetStatusAllowsEditing(status), status).toBe(true)
    }
  })

  it('is the status half of canEditAsset, so the two cannot disagree', () => {
    for (const ref of [published, draft, sold, suspendedListing]) {
      expect(canEditAsset(seller, ref), ref.status).toBe(assetStatusAllowsEditing(ref.status))
    }
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
  it('allows only the owning seller, and only on a pending request', () => {
    expect(canDecideAccess(seller, published, 'REQUESTED')).toBe(true)
    expect(canDecideAccess(otherSeller, published, 'REQUESTED')).toBe(false)
    expect(canDecideAccess(manager, published, 'REQUESTED')).toBe(false)
  })

  it('refuses to decide a request that was never made', () => {
    expect(canDecideAccess(seller, published, 'NONE')).toBe(false)
  })

  it('refuses to re-decide a settled request', () => {
    expect(canDecideAccess(seller, published, 'APPROVED')).toBe(false)
    expect(canDecideAccess(seller, published, 'DECLINED')).toBe(false)
    expect(canDecideAccess(seller, published, 'REVOKED')).toBe(false)
  })
})

describe('canRevokeAccess', () => {
  it('allows the owning seller and the manager to revoke a live grant', () => {
    expect(canRevokeAccess(seller, published, 'APPROVED')).toBe(true)
    expect(canRevokeAccess(manager, published, 'APPROVED')).toBe(true)
  })

  it('denies an unrelated seller', () => {
    expect(canRevokeAccess(otherSeller, published, 'APPROVED')).toBe(false)
  })

  it('cannot revoke what was never granted', () => {
    expect(canRevokeAccess(seller, published, 'NONE')).toBe(false)
    expect(canRevokeAccess(seller, published, 'REQUESTED')).toBe(false)
    expect(canRevokeAccess(seller, published, 'REVOKED')).toBe(false)
  })
})

/**
 * Named for what it answers rather than `canAccessApp`. The behaviour is
 * these assertions are the originals; only the name and what it claims moved
 * (see the predicate's own doc comment). `null` returning `true` is the
 * reason it is `statusAllows…` and not `canAccess…`: an anonymous visitor is
 * barred from a dashboard by `viewerGate`'s `REQUIRE_LOGIN`, not by anything
 * about their account status.
 */
describe('statusAllowsAuthenticatedSurfaces', () => {
  it('does not bar an anonymous visitor on status grounds', () => {
    expect(statusAllowsAuthenticatedSurfaces(null)).toBe(true)
  })

  it('lets active accounts in', () => {
    expect(statusAllowsAuthenticatedSurfaces(buyer)).toBe(true)
  })

  it('locks out suspended and removed accounts', () => {
    expect(statusAllowsAuthenticatedSurfaces({ ...buyer, status: 'SUSPENDED' })).toBe(false)
    expect(statusAllowsAuthenticatedSurfaces({ ...buyer, status: 'REMOVED' })).toBe(false)
  })
})

describe('canPublishListing', () => {
  it('allows an active seller with a profile', () => {
    expect(canPublishListing(seller)).toBe(true)
  })

  it('denies buyers, managers, anonymous visitors and suspended sellers', () => {
    expect(canPublishListing(buyer)).toBe(false)
    expect(canPublishListing(manager)).toBe(false)
    expect(canPublishListing(null)).toBe(false)
    expect(canPublishListing({ ...seller, status: 'SUSPENDED' })).toBe(false)
  })
})

describe('canBrowseBuyers', () => {
  it('allows an active seller and an active manager', () => {
    expect(canBrowseBuyers(seller)).toBe(true)
    expect(canBrowseBuyers(manager)).toBe(true)
  })

  it('denies a buyer, so a competitor cannot browse the directory', () => {
    expect(canBrowseBuyers(buyer)).toBe(false)
  })

  it('denies an anonymous visitor and a suspended seller', () => {
    expect(canBrowseBuyers(null)).toBe(false)
    expect(canBrowseBuyers({ ...seller, status: 'SUSPENDED' })).toBe(false)
  })
})

describe('canModerate, canModerateUser and canMessage', () => {
  it('restricts moderation to active managers', () => {
    expect(canModerate(manager)).toBe(true)
    expect(canModerate({ ...manager, status: 'SUSPENDED' })).toBe(false)
    expect(canModerate(seller)).toBe(false)
    expect(canModerate(null)).toBe(false)
  })

  /**
   * The self-moderation guard: a manager who suspends or removes
   * their own account locks themselves out of the only surface that could
   * undo it, and on a single-manager deployment that is unrecoverable.
   */
  it('lets a manager act on any account but their own', () => {
    expect(canModerateUser(manager, { userId: seller.userId })).toBe(true)
    expect(canModerateUser(manager, { userId: buyer.userId })).toBe(true)
    expect(canModerateUser(manager, { userId: manager.userId })).toBe(false)
  })

  it('never lets a non-manager moderate an account, their own included', () => {
    for (const viewer of [null, buyer, seller, { ...manager, status: 'SUSPENDED' as const }]) {
      expect(canModerateUser(viewer, { userId: 'u-anyone' })).toBe(false)
    }
    // A second manager account is the thing that makes moderating a manager
    // legitimate at all — it is only *yourself* that is off limits.
    expect(canModerateUser({ ...manager, userId: 'u-manager-2' }, { userId: manager.userId })).toBe(
      true,
    )
  })

  it('blocks messaging a suspended counterparty', () => {
    expect(canMessage(buyer, { userId: 'u-seller', status: 'ACTIVE' })).toBe(true)
    expect(canMessage(buyer, { userId: 'u-seller', status: 'SUSPENDED' })).toBe(false)
    expect(canMessage({ ...buyer, status: 'REMOVED' }, { userId: 'u-seller', status: 'ACTIVE' })).toBe(false)
    expect(canMessage(manager, { userId: 'u-seller', status: 'ACTIVE' })).toBe(false)
  })

  it('refuses to let anyone message themselves', () => {
    expect(canMessage(buyer, { userId: buyer.userId, status: 'ACTIVE' })).toBe(false)
  })
})

describe('contactAvailability', () => {
  const activeSeller = { userId: 'u-seller', status: 'ACTIVE' } as const
  const activeBuyer = { userId: 'u-buyer', status: 'ACTIVE' } as const

  it('lets an active buyer contact an active seller, and vice versa', () => {
    expect(contactAvailability(buyer, activeSeller, 'BUYER')).toBe('ALLOWED')
    expect(contactAvailability(seller, activeBuyer, 'SELLER')).toBe('ALLOWED')
  })

  it('tells an anonymous visitor to sign in', () => {
    expect(contactAvailability(null, activeSeller, 'BUYER')).toBe('SIGN_IN')
  })

  /**
   * The four reasons the single "This account cannot be messaged" string
   * used to cover. In three of them the counterparty is perfectly
   * messageable and the copy was simply false; only the last one is about
   * the account being looked at.
   */
  it('names the viewer-side reason rather than blaming the counterparty', () => {
    expect(contactAvailability({ ...buyer, status: 'SUSPENDED' }, activeSeller, 'BUYER')).toBe(
      'VIEWER_INACTIVE',
    )
    expect(contactAvailability(manager, activeSeller, 'BUYER')).toBe('MANAGER')
    // A seller looking at their own listing: `canMessage` refuses a
    // self-thread, and "this account cannot be messaged" reads as an error
    // about the seller's own company.
    expect(contactAvailability(seller, { userId: seller.userId, status: 'ACTIVE' }, 'BUYER')).toBe(
      'SELF',
    )
    // A seller (no `BuyerProfile`) on a listing page, and a buyer (no
    // `SellerProfile`) on a buyer page: neither can occupy the side of the
    // thread they would have to occupy.
    expect(contactAvailability(seller, { userId: otherSeller.userId, status: 'ACTIVE' }, 'BUYER')).toBe(
      'WRONG_SIDE',
    )
    expect(contactAvailability(buyer, activeSeller, 'SELLER')).toBe('WRONG_SIDE')
  })

  it('blames the counterparty only when the counterparty is genuinely not active', () => {
    expect(contactAvailability(buyer, { userId: 'u-seller', status: 'SUSPENDED' }, 'BUYER')).toBe(
      'COUNTERPARTY_INACTIVE',
    )
    expect(contactAvailability(buyer, { userId: 'u-seller', status: 'REMOVED' }, 'BUYER')).toBe(
      'COUNTERPARTY_INACTIVE',
    )
  })

  /**
   * `'ALLOWED'` must mean exactly what the two hand-written booleans it
   * replaced meant — `canMessage` plus the profile row for the viewer's own
   * side of the thread — or a button comes back that the action refuses.
   */
  it("agrees with canMessage plus the viewer's own side of the thread", () => {
    const viewers = [null, buyer, seller, manager, { ...buyer, status: 'SUSPENDED' as const }]
    const counterparties = [
      { userId: 'u-seller', status: 'ACTIVE' as const },
      { userId: 'u-buyer', status: 'ACTIVE' as const },
      { userId: 'u-seller', status: 'SUSPENDED' as const },
    ]
    for (const viewer of viewers) {
      for (const counterparty of counterparties) {
        for (const side of ['BUYER', 'SELLER'] as const) {
          const sideProfileId =
            viewer === null
              ? null
              : side === 'BUYER'
                ? viewer.buyerProfileId
                : viewer.sellerProfileId
          const expected = sideProfileId !== null && canMessage(viewer, counterparty)
          expect(
            contactAvailability(viewer, counterparty, side) === 'ALLOWED',
            `${viewer?.role ?? 'anonymous'} → ${counterparty.userId}/${counterparty.status} as ${side}`,
          ).toBe(expected)
        }
      }
    }
  })
})

describe('viewerGate', () => {
  it('sends an anonymous visitor to log in', () => {
    expect(viewerGate(null)).toBe('REQUIRE_LOGIN')
  })

  it('allows an active buyer, seller and manager through', () => {
    expect(viewerGate(buyer)).toBe('ALLOW')
    expect(viewerGate(seller)).toBe('ALLOW')
    expect(viewerGate(manager)).toBe('ALLOW')
  })

  it('routes a suspended viewer to the suspended screen', () => {
    expect(viewerGate({ ...buyer, status: 'SUSPENDED' })).toBe('SUSPENDED')
  })

  it('routes a removed viewer to the suspended screen too', () => {
    // Defensive rather than reachable: `getViewer` (`@/server/session`)
    // already collapses a REMOVED user to `null` before `viewerGate` ever
    // sees them, so this branch cannot currently be hit through the real
    // `getViewer` → `requireViewer` path. This documents the predicate's own
    // intended behaviour in isolation.
    expect(viewerGate({ ...buyer, status: 'REMOVED' })).toBe('SUSPENDED')
  })
})
