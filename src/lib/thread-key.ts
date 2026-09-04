export interface ThreadKeyInput {
  assetId: string | null
  buyerProfileId: string
  sellerProfileId: string
}

/**
 * A deterministic unique key for a conversation.
 *
 * This exists because Postgres treats NULLs as distinct in a unique index: a
 * composite unique on (assetId, buyerProfileId, sellerProfileId) would happily
 * allow unlimited duplicate asset-less threads between the same two parties.
 * Encoding the null as a sentinel and carrying the constraint on one string
 * column closes that hole. The `asset:` prefix keeps a real asset whose id is
 * literally "none" from colliding with the sentinel.
 *
 * Landed in Task 14 (rather than Task 19, which specifies it) because
 * `decideAccess` (`@/server/actions/access-requests`) already needs to open a
 * `Conversation` on approval, and `prisma/seed.ts` had an inline copy of this
 * exact expression pending this file's creation. Task 19 imports this
 * unchanged.
 */
export function buildThreadKey(input: ThreadKeyInput): string {
  const asset = input.assetId === null ? 'noasset' : `asset:${input.assetId}`
  return `${asset}|buyer:${input.buyerProfileId}|seller:${input.sellerProfileId}`
}
