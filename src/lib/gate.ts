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
 *
 * `requestStillEligible` fixes a defect: a `REQUESTED` grant used to render
 * `'PENDING'` unconditionally, trusting that whatever made the request
 * legal at the time is still true. It is not, in two real scenarios —
 * the seller's listing is later marked `SOLD` (or otherwise moved off
 * `PUBLISHED`), or the requesting buyer is suspended after requesting — and
 * both used to still show "Pending" forever, because nothing re-checked
 * eligibility once a `REQUESTED` row existed.
 *
 * The signal this takes is the caller re-running `canRequestAccess(viewer,
 * ref, 'NONE')` — i.e. "if this buyer had never asked, could they request
 * right now?" — deliberately passing the hypothetical `'NONE'` grant rather
 * than the real (`'REQUESTED'`) one, so the answer reflects only the other
 * three conditions `canRequestAccess` checks (the viewer is still an active
 * buyer, the asset is still `PUBLISHED`, and `canViewAsset` still holds) and
 * not the grant itself. When that comes back `false` while the real grant is
 * still `'REQUESTED'`, the underlying eligibility no longer holds and this
 * resolves to `'CLOSED'` instead of leaving the buyer's own view stuck
 * showing "Pending" forever. This is purely a display fix on the buyer's
 * side of the gate — `canDecideAccess` (`@/lib/authz`) is unchanged and
 * still lets the seller decide a `REQUESTED` row regardless of the asset's
 * current status or the buyer's current standing; whether it should
 * re-check those too is a separate authorization question this task does
 * not touch.
 */
export function selectGateStatus(input: {
  isFullAsset: boolean
  grant: GrantState
  canRequest: boolean
  requestStillEligible: boolean
}): GateStatus {
  if (input.isFullAsset) return 'OPEN'
  if (input.grant === 'REQUESTED') return input.requestStillEligible ? 'PENDING' : 'CLOSED'
  if (input.canRequest) return 'REQUESTABLE'
  return 'CLOSED'
}
