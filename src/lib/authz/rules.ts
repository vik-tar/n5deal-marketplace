import type { AssetStatus } from '@/generated/prisma/client'
import type { AssetRef, GrantState, MaybeViewer, Viewer } from './types'

/** Statuses whose listings are reachable by a public URL. */
const PUBLIC_ASSET_STATUSES: readonly AssetStatus[] = ['PUBLISHED', 'SOLD']

export function isActive(viewer: MaybeViewer): viewer is Viewer {
  return viewer !== null && viewer.status === 'ACTIVE'
}

/**
 * Whether this viewer's **account status** bars them from the app's
 * **authenticated surfaces** — the dashboards, the inbox, `/profile`, the
 * manager console — as opposed to the public pages anybody may open.
 *
 * Renamed from `canAccessApp` in Task 20, and the rename is not cosmetic.
 * The old name asserted "a non-`ACTIVE` viewer may not access the app", which
 * is not what this codebase does and never was: `/listings`, a listing teaser
 * and the landing page are public, and a suspended viewer who opens one is
 * served exactly what an anonymous visitor is served. Suspension means you
 * may not transact, not that you may not look — `canViewAsset` below was
 * deliberately widened in Task 13 to stop denying non-`ACTIVE` viewers for
 * precisely this reason, and redirecting a public URL for a signed-in-but-
 * suspended user is worse for them than the nav gate and the `/suspended`
 * page they already get. Semantics settled in Task 12; behaviour unchanged
 * here.
 *
 * It is `statusAllows…` rather than `canAccess…` because `null` — an
 * anonymous visitor — returns `true`, and an anonymous visitor plainly cannot
 * open a dashboard. What this answers is narrower than the whole admission
 * decision: *nothing about this viewer's status* bars them. Being signed out
 * bars them too, under a different rule. `viewerGate` below is the predicate
 * that makes the whole decision, splitting exactly those two cases into
 * `REQUIRE_LOGIN` and `SUSPENDED`, and it — not this — is what `requireViewer`
 * (`@/server/session`) actually dispatches on.
 *
 * **`viewerGate` calls this, and that is deliberate.** Until the whole-branch
 * review it did not: three production files named this predicate in prose to
 * justify their behaviour, four tests exercised it, and nothing in the app
 * called it — documentation with an `export` on it. That is the exact shape
 * this codebase deleted `listAssets`' per-row `canViewAsset` for (Task 12,
 * cited again at `HERO_CTA_ORDER`, `@/lib/nav`): a rule that cannot change an
 * outcome reads to the next maintainer as a rule that is doing something. The
 * choice was to delete it or to give it the enforcement role its own doc
 * already claimed. It got the role, because the second sentence of this
 * comment is a real rule the product has to keep and `viewerGate`'s
 * `status !== 'ACTIVE'` was that rule written out a second time — so the two
 * could drift, and one of them was the one every page actually obeys.
 *
 * It is *not* callable in place of the whole gate, which is why the header
 * does not use it: `site-header.tsx` needs "signed in **and** active", and
 * this returns `true` for `null`. That question is `isActive` above, and the
 * header calls that.
 */
export function statusAllowsAuthenticatedSurfaces(viewer: MaybeViewer): boolean {
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
  if (!statusAllowsAuthenticatedSurfaces(viewer)) return 'SUSPENDED'
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
 * Whether this manager may act on this *account*. `canModerate`, minus
 * yourself.
 *
 * The self-check is the whole reason this predicate exists rather than a bare
 * `canModerate` call in `@/server/actions/moderation`. Suspending or removing
 * your own account is a one-click, self-inflicted lockout: `getViewer`
 * (`@/server/session`) re-reads `status` on every request, so the very next
 * navigation sends a self-suspended manager to `/suspended`, and a
 * self-removed one is collapsed to `null` and signed out. On a deployment
 * whose only manager is `manager@n5deal.demo` there is then nobody left who
 * can undo it — the console is the only surface that writes `UserStatus`, and
 * reaching it requires the account that just locked itself out.
 *
 * A predicate rather than an `if` inside the action so it is unit-testable:
 * a guard against an irreversible action is exactly the kind that must fail
 * in a test rather than only in production. Listings need no equivalent — a
 * `MANAGER` holds no `SellerProfile`, so `isOwner` is false for every asset
 * and there is no "my own listing" to guard against.
 *
 * Takes the target's user id in an object rather than bare, matching
 * `canMessage` below: both answer "may I act on this *other party*", and a
 * bare second `string` next to a `Viewer` is the argument order this codebase
 * would eventually pass backwards.
 */
export function canModerateUser(viewer: MaybeViewer, target: { userId: string }): boolean {
  // `canModerate` returns a plain `boolean`, not a type predicate, so `tsc`
  // does not narrow `viewer` past it — hence the null check, which is
  // unreachable at runtime (`canModerate` is false for `null`) and there only
  // to reach `viewer.userId`. Widening `canModerate`'s own return type to
  // `viewer is Viewer` would remove it and would be sound, but it changes a
  // signature nine other call sites read, to save one line here.
  return canModerate(viewer) && viewer !== null && viewer.userId !== target.userId
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

/**
 * Confidential-field visibility. Requires an approved, still-valid grant.
 *
 * **The `&& canViewAsset(viewer, asset)` conjunct is load-bearing, not a
 * redundant re-check.** It is what stops an approved grant from outliving
 * the listing it was granted on: an `AccessRequest` row stays `'APPROVED'`
 * when the listing is suspended and when its seller is suspended, so on the
 * grant alone the confidential half would keep disclosing after a takedown.
 *
 * It *reads* as dead code at `getAssetDetail` (`@/server/queries/assets`),
 * which has already returned `null` on `!canViewAsset` several lines before
 * it calls this. It is the **entire** gate at `discloseSellerName`
 * (`@/server/queries/conversations`), which has no prior visibility check
 * anywhere and uses this predicate's answer to decide whether every message
 * thread about a listing prints the seller's `companyName`. Simplify the
 * conjunct away on the strength of the first call site and the second one
 * silently opens the seller's identity on every thread about a suspended
 * listing — which is the one thing the NDA gate exists to protect.
 *
 * `tests/unit/authz/rules.test.ts` asserts both halves against an
 * `'APPROVED'` grant (a `'SUSPENDED'` listing, and a listing whose owner is
 * suspended) for exactly that reason: before those two cases existed, every
 * `false` assertion here was already satisfied by an earlier conjunct and
 * every `true` one used a `PUBLISHED`/`ACTIVE`-owner ref, so deleting this
 * line left the whole suite green.
 */
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

/**
 * The status half of `canEditAsset`, on its own. `SOLD` is terminal: the
 * edit page 404s on one and `saveDraft` refuses it.
 *
 * Exported so the seller dashboard can decide per row whether to *offer*
 * "Edit" (`SellerListingSummary.canEdit`, `@/server/queries/assets`) instead
 * of re-deriving `!== 'SOLD'` inline in a component. That query reads one
 * seller's own listings by `sellerProfileId`, so `isOwner` holds by
 * construction there and this is the only half left to decide. Anywhere a
 * viewer is genuinely in question, `canEditAsset` below is the predicate to
 * call — this one answers nothing about who is asking.
 */
export function assetStatusAllowsEditing(status: AssetStatus): boolean {
  return status !== 'SOLD'
}

export function canEditAsset(viewer: MaybeViewer, asset: AssetRef): boolean {
  return isOwner(viewer, asset) && assetStatusAllowsEditing(asset.status)
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

/**
 * Why "Contact seller" / "Contact buyer" is or is not offered — a reason,
 * not a boolean.
 *
 * `canMessage` above answers only "may these two parties talk", which is
 * part of the question a *disabled* button has to explain. A `Conversation`
 * has a buyer side and a seller side, and a viewer holding no profile row
 * for the side they would occupy cannot be a party to it at all:
 * `startConversation` (`@/server/actions/messages`) refuses them with
 * `FORBIDDEN`. `AssetDetail.canContactSeller` and `BuyerDetail.canContact`
 * each combined those two rules by hand, in the same shape, on opposite
 * sides of the market; this is that combination named once so they cannot
 * drift, and so the copy can say *which* answer applies.
 *
 * The boolean this replaces collapsed several unrelated situations into one
 * sentence — "This account cannot be messaged" — that was true for exactly
 * one of them. A manager viewing anyone, and a seller viewing a listing, are
 * both looking at a perfectly messageable counterparty; what disqualifies
 * them is their own standing, not the account in front of them, and telling
 * them otherwise sends them to support about somebody else's account.
 *
 * The order is deliberate: the viewer's own disqualifications are reported
 * before the counterparty's, so a suspended viewer looking at a suspended
 * seller is told about their own account — the one they can actually appeal.
 * `'ALLOWED'` is returned exactly where the two booleans it replaces were
 * `true`.
 */
export type ContactAvailability =
  | 'ALLOWED'
  | 'SIGN_IN'
  | 'VIEWER_INACTIVE'
  | 'MANAGER'
  | 'SELF'
  | 'WRONG_SIDE'
  | 'COUNTERPARTY_INACTIVE'

export function contactAvailability(
  viewer: MaybeViewer,
  counterparty: { userId: string; status: 'ACTIVE' | 'SUSPENDED' | 'REMOVED' },
  /** Which side of the thread this viewer would occupy. */
  viewerSide: 'BUYER' | 'SELLER',
): ContactAvailability {
  if (viewer === null) return 'SIGN_IN'
  if (!isActive(viewer)) return 'VIEWER_INACTIVE'
  if (viewer.role === 'MANAGER') return 'MANAGER'
  if (viewer.userId === counterparty.userId) return 'SELF'
  const sideProfileId = viewerSide === 'BUYER' ? viewer.buyerProfileId : viewer.sellerProfileId
  if (sideProfileId === null) return 'WRONG_SIDE'
  // Every reason `canMessage` refuses for has now been named individually,
  // so the only one it has left is the counterparty's status. The call is
  // still made rather than that condition re-derived, because this
  // function's `'ALLOWED'` must mean the same thing the action's own gate
  // means. It is also why this branch, not the `return` below it, absorbs
  // anything a future rule adds to `canMessage`: the failure mode is copy
  // that names the wrong reason, never a button that is offered and refused.
  if (!canMessage(viewer, counterparty)) return 'COUNTERPARTY_INACTIVE'
  return 'ALLOWED'
}
