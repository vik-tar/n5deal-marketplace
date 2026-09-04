import type { AccessStatus } from '@/generated/prisma/client'
import type { GrantState } from '@/lib/authz'

/**
 * Pure logic for the NDA gate on the asset detail page, deliberately kept
 * free of any import of `@/server/db` — see `@/server/queries/asset-where`
 * for the identical rationale. `getAssetDetail` (`@/server/queries/assets`)
 * is the only caller that talks to Postgres; everything here is plain data
 * in, plain data out, so both functions are unit-testable without a database.
 */

/**
 * Maps the viewer's own `AccessRequest` row — or its absence — to a
 * `GrantState`. A missing row means the viewer has never asked: `'NONE'`.
 * `AccessStatus`'s four members are a subset of `GrantState`'s five, so a
 * present row's status carries over unchanged.
 */
export function mapGrantState(status: AccessStatus | null): GrantState {
  return status ?? 'NONE'
}

/** Which of the gate's four states the asset detail page should render. */
export type GateStatus = 'OPEN' | 'REQUESTABLE' | 'PENDING' | 'CLOSED'

/**
 * Picks the gate state from booleans the caller already derived via
 * `@/lib/authz` — this does not re-derive authorization, only choose a UI
 * state from its answers.
 *
 * `canRequest` is expected to be the result of `canRequestAccess(viewer, ref,
 * grant)`, so `'REQUESTABLE'` already means "an active buyer, on a
 * PUBLISHED listing, who has never asked" — anonymous visitors, sellers on a
 * listing that is not their own, a non-PUBLISHED asset, and a buyer who was
 * declined or revoked all fail that check and fall through to `'CLOSED'`.
 */
export function selectGateStatus(input: {
  isFullAsset: boolean
  grant: GrantState
  canRequest: boolean
}): GateStatus {
  if (input.isFullAsset) return 'OPEN'
  if (input.grant === 'REQUESTED') return 'PENDING'
  if (input.canRequest) return 'REQUESTABLE'
  return 'CLOSED'
}
