import type { AssetStatus, Role, UserStatus } from '@/generated/prisma/client'

/** The authenticated actor, flattened from the session. */
export interface Viewer {
  userId: string
  email: string
  role: Role
  status: UserStatus
  buyerProfileId: string | null
  sellerProfileId: string | null
}

/** `null` is an anonymous visitor, who may browse published listings. */
export type MaybeViewer = Viewer | null

/** The minimum an authorization decision needs to know about a listing. */
export interface AssetRef {
  id: string
  sellerProfileId: string
  status: AssetStatus
  /** The owning seller's account status — a suspended owner hides their listings. */
  ownerStatus: UserStatus
}

export type GrantState = 'NONE' | 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'REVOKED'
