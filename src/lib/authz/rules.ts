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

export function canPublishListing(viewer: MaybeViewer): boolean {
  return isActive(viewer) && viewer.role === 'SELLER' && viewer.sellerProfileId !== null
}

/** Teaser-level visibility. */
export function canViewAsset(viewer: MaybeViewer, asset: AssetRef): boolean {
  if (canModerate(viewer)) return true
  if (isOwner(viewer, asset)) return true
  if (viewer !== null && viewer.status !== 'ACTIVE') return false
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

export function canDecideAccess(viewer: MaybeViewer, asset: AssetRef): boolean {
  return isOwner(viewer, asset)
}

export function canRevokeAccess(viewer: MaybeViewer, asset: AssetRef): boolean {
  return isOwner(viewer, asset) || canModerate(viewer)
}

/** Managers moderate the marketplace; they do not transact in it. */
export function canMessage(
  viewer: MaybeViewer,
  counterpartyStatus: 'ACTIVE' | 'SUSPENDED' | 'REMOVED',
): boolean {
  if (!isActive(viewer)) return false
  if (viewer.role === 'MANAGER') return false
  return counterpartyStatus === 'ACTIVE'
}
