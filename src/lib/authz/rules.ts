import type { AssetStatus } from '@/generated/prisma/client'
import type { AssetRef, GrantState, MaybeViewer, Viewer } from './types'

/** Statuses whose listings are reachable by a public URL. */
export const PUBLIC_ASSET_STATUSES: readonly AssetStatus[] = ['PUBLISHED', 'SOLD']

export function isActive(viewer: MaybeViewer): viewer is Viewer {
  return viewer !== null && viewer.status === 'ACTIVE'
}

/** Anonymous visitors may browse; suspended and removed accounts may not. */
export function canAccessApp(viewer: MaybeViewer): boolean {
  return viewer === null || viewer.status === 'ACTIVE'
}

export type ViewerGate = 'ALLOW' | 'REQUIRE_LOGIN' | 'SUSPENDED'

/**
 * What a page should do with a viewer, separated from how it does it so the
 * decision can be tested without a database or a session. `requireViewer`
 * (`@/server/session`) switches on this instead of re-deriving the branches
 * itself.
 *
 * A `REMOVED` viewer maps to `'SUSPENDED'` here too — defensively: in
 * practice `getViewer` already collapses a `REMOVED` user to `null` before
 * this ever sees them, so that branch is unreachable through the real
 * `getViewer` → `requireViewer` path today. The test below documents the
 * intended behaviour of this predicate on its own, not current reachability.
 */
export function viewerGate(viewer: MaybeViewer): ViewerGate {
  if (viewer === null) return 'REQUIRE_LOGIN'
  if (viewer.status !== 'ACTIVE') return 'SUSPENDED'
  return 'ALLOW'
}

export function isOwner(viewer: MaybeViewer, asset: AssetRef): boolean {
  return (
    isActive(viewer) &&
    viewer.sellerProfileId !== null &&
    viewer.sellerProfileId === asset.sellerProfileId
  )
}

export function canModerate(viewer: MaybeViewer): boolean {
  return isActive(viewer) && viewer.role === 'MANAGER'
}

/**
 * The buyer directory (Task 17) is competitive intelligence, not a public
 * catalog: only the parties who might actually approach a buyer directly (an
 * active seller) or who moderate the market (a manager) may browse it. A
 * buyer asking for it must not learn who else is shopping the same sellers'
 * listings — `listBuyers` (`@/server/queries/buyers`) returns an empty
 * result rather than a 403 for anyone this returns `false` for, exactly as
 * `getAssetRequestQueue` (`@/server/queries/assets`) returns empty arrays
 * instead of an error.
 */
export function canBrowseBuyers(viewer: MaybeViewer): boolean {
  return isActive(viewer) && (viewer.role === 'SELLER' || viewer.role === 'MANAGER')
}

export function canPublishListing(viewer: MaybeViewer): boolean {
  return isActive(viewer) && viewer.role === 'SELLER' && viewer.sellerProfileId !== null
}

/** Teaser-level visibility. */
export function canViewAsset(viewer: MaybeViewer, asset: AssetRef): boolean {
  if (canModerate(viewer)) return true
  if (isOwner(viewer, asset)) return true
  // A suspended or removed viewer sees exactly what an anonymous visitor sees:
  // a public teaser and nothing more. Suspension bars transacting, not looking,
  // and the catalog's visibility floor is already viewer-status-blind — denying
  // here produced a card in the list that 404s when clicked.
  return PUBLIC_ASSET_STATUSES.includes(asset.status) && asset.ownerStatus === 'ACTIVE'
}

/** Confidential-field visibility. Requires an approved, still-valid grant. */
export function canViewFullAsset(
  viewer: MaybeViewer,
  asset: AssetRef,
  grant: GrantState,
): boolean {
  if (canModerate(viewer)) return true
  if (isOwner(viewer, asset)) return true
  if (!isActive(viewer) || viewer.buyerProfileId === null) return false
  return grant === 'APPROVED' && canViewAsset(viewer, asset)
}

export function canEditAsset(viewer: MaybeViewer, asset: AssetRef): boolean {
  return isOwner(viewer, asset) && asset.status !== 'SOLD'
}

/**
 * A buyer gets one shot per listing: the unique constraint on
 * (assetId, buyerProfileId) means a declined or revoked grant is final.
 */
export function canRequestAccess(
  viewer: MaybeViewer,
  asset: AssetRef,
  grant: GrantState,
): boolean {
  if (!isActive(viewer) || viewer.buyerProfileId === null) return false
  if (asset.status !== 'PUBLISHED') return false
  if (!canViewAsset(viewer, asset)) return false
  return grant === 'NONE'
}

/** Only the owning seller decides, and only on a request that is actually pending. */
export function canDecideAccess(
  viewer: MaybeViewer,
  asset: AssetRef,
  grant: GrantState,
): boolean {
  return isOwner(viewer, asset) && grant === 'REQUESTED'
}

/** You cannot revoke what was never granted. */
export function canRevokeAccess(
  viewer: MaybeViewer,
  asset: AssetRef,
  grant: GrantState,
): boolean {
  return (isOwner(viewer, asset) || canModerate(viewer)) && grant === 'APPROVED'
}

/**
 * Managers moderate the marketplace; they do not transact in it.
 *
 * Relationship scoping is deliberately NOT this predicate's job: cold contact
 * is a required capability of the product — a seller browses buyers and
 * contacts one, a buyer contacts a seller from a teaser — so no approved grant
 * or shared listing is required. What is required is that both parties are
 * active accounts and that they are two different people.
 */
export function canMessage(
  viewer: MaybeViewer,
  counterparty: { userId: string; status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED' },
): boolean {
  if (!isActive(viewer)) return false
  if (viewer.role === 'MANAGER') return false
  if (viewer.userId === counterparty.userId) return false
  return counterparty.status === 'ACTIVE'
}
