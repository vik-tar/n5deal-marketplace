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
 * Held here rather than inline in either writer, because both
 * `decideAccess` (`@/server/actions/access-requests`, which opens a
 * `Conversation` on approval) and `startConversation`
 * (`@/server/actions/messages`) must derive the identical key or the unique
 * constraint stops meaning one thread per relationship. `prisma/seed.ts`
 * imports it for the same reason.
 */
export function buildThreadKey(input: ThreadKeyInput): string {
  const asset = input.assetId === null ? 'noasset' : `asset:${input.assetId}`
  return `${asset}|buyer:${input.buyerProfileId}|seller:${input.sellerProfileId}`
}
