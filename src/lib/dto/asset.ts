import type { Asset } from '@/generated/prisma/client'

/**
 * Fields released only to a buyer holding an approved access request,
 * to the owning seller, and to the platform manager.
 */
export const CONFIDENTIAL_ASSET_FIELDS = [
  'legalName',
  'revenueCents',
  'ebitdaCents',
  'clientCount',
  'dataRoomUrl',
  'confidentialNotes',
] as const

/**
 * Fields safe for the anonymous teaser. `rejectionReason` is listed here because
 * it carries no deal information — it is only ever rendered on the owning
 * seller's own dashboard.
 */
export const PUBLIC_ASSET_FIELDS = [
  'id',
  'publicRef',
  'sellerProfileId',
  'status',
  'category',
  'licenceType',
  'businessType',
  'country',
  'regulator',
  'businessStatus',
  'askingPriceCents',
  'employees',
  'yearOfIssue',
  'included',
  'teaserTitle',
  'teaserDescription',
  'publishedAt',
  'rejectionReason',
  'viewCount',
  'createdAt',
  'updatedAt',
] as const

export type PublicAssetField = (typeof PUBLIC_ASSET_FIELDS)[number]

/**
 * Money columns are `bigint` on the Prisma row and `number` from here upward.
 * Next.js cannot serialise a bigint across the server/client boundary, so this
 * layer — which already exists to strip confidential fields — is also where the
 * narrowing happens. Lossless: MAX_SAFE_INTEGER is €90 trillion in cents.
 */
const MONEY_FIELDS = ['askingPriceCents', 'revenueCents', 'ebitdaCents'] as const
type MoneyField = (typeof MONEY_FIELDS)[number]

/**
 * Derived from `PUBLIC_ASSET_FIELDS` itself (via `Pick`), not from `Asset`
 * minus the confidential allowlist — so the type and the runtime copy loop in
 * `toTeaserAsset` are one description, not two. Forgetting to add a new
 * column to the allowlist then makes every call site that reads it a type
 * error, not just a runtime `undefined` the compiler stays quiet about.
 */
export type TeaserAsset = Omit<Pick<Asset, PublicAssetField>, 'askingPriceCents'> & {
  askingPriceCents: number
  redacted: true
}
export type FullAsset = Omit<Asset, MoneyField> &
  Record<MoneyField, number> & {
    redacted: false
  }

export type AssetDto = TeaserAsset | FullAsset

/** Builds a teaser by construction, not by deletion — a new column is absent by default. */
export function toTeaserAsset(asset: Asset): TeaserAsset {
  const teaser = {} as Record<string, unknown>
  for (const field of PUBLIC_ASSET_FIELDS) {
    const value = asset[field]
    teaser[field] = typeof value === 'bigint' ? Number(value) : value
  }
  teaser.redacted = true
  // Built field-by-field from the public allowlist above; the cast is the
  // narrow escape hatch for reassembling that object into its named type.
  return teaser as TeaserAsset
}

export function toFullAsset(asset: Asset): FullAsset {
  const full = { ...asset } as Record<string, unknown>
  for (const field of MONEY_FIELDS) {
    full[field] = Number(asset[field])
  }
  full.redacted = false
  // Spread from `asset` plus the three money fields renarrowed above; the
  // cast is the narrow escape hatch for reassembling that into its named type.
  return full as FullAsset
}

export function toAssetDto(asset: Asset, canSeeConfidential: boolean): AssetDto {
  return canSeeConfidential ? toFullAsset(asset) : toTeaserAsset(asset)
}

export function isFullAsset(dto: AssetDto): dto is FullAsset {
  return dto.redacted === false
}
