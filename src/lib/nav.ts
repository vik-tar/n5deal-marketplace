/**
 * Which primary navigation items a viewer may see, and where they point.
 *
 * Pure: no database, no fetch, no environment. Kept out of the header
 * component so the visibility rules can be unit-tested on their own.
 */

/** Keys into the `nav` message namespace. */
export type NavKey =
  | 'listings'
  | 'buyers'
  | 'dashboard'
  | 'inbox'
  | 'newListing'
  | 'profile'
  | 'admin'

/** Locale-agnostic targets; `Link` from `@/i18n/navigation` adds the prefix. */
export const NAV_HREF: Record<NavKey, string> = {
  listings: '/listings',
  buyers: '/buyers',
  dashboard: '/dashboard',
  inbox: '/inbox',
  newListing: '/listings/new',
  profile: '/profile',
  admin: '/admin',
}

/** Where an anonymous visitor goes to sign in. */
export const SIGN_IN_HREF = '/login'

/**
 * Which profile rows the viewer has. Two booleans rather than the `Viewer`
 * itself, for the reason `role` below is a bare `string`: this module must
 * stay free of any server-only import, and `Viewer.buyerProfileId` is a cuid
 * the header has no business handing to a pure visibility function that only
 * needs to know whether it is null.
 */
export interface NavProfiles {
  /** The viewer has a `BuyerProfile` row — exactly what `/profile` requires. */
  buyer: boolean
  /** The viewer has a `SellerProfile` row — half of what `canPublishListing` requires. */
  seller: boolean
}

/** An anonymous visitor, and the default for callers that only know a role. */
const NO_PROFILES: NavProfiles = { buyer: false, seller: false }

/**
 * `role` is the viewer's role, or `null` for an anonymous visitor. It is typed
 * as `string` rather than the Prisma `Role` so the header stays free of a
 * server-only import; `Role` is assignable to it.
 *
 * `profiles` defaults to "neither", so a caller that knows only the role gets
 * exactly the pre-Task-18 key set back.
 *
 * The last two keys are the entry points to pages that existed but were
 * unreachable from any UI until Task 18 (`/listings/new` from Task 15,
 * `/profile` from Task 16). Each mirrors the guard its own page applies, and
 * the two guards are genuinely different:
 *
 * - `/listings/new` calls `canPublishListing` (`@/lib/authz`), which requires
 *   an active `SELLER` *with* a `SellerProfile` — so both conditions appear
 *   here.
 * - `/profile` 404s on `viewer.buyerProfileId === null` and checks nothing
 *   else, so the nav gates on the profile row alone. Adding a `role ===
 *   'BUYER'` test here would be a stricter rule than the page enforces, and
 *   nav that hides a page the viewer can still open is the same class of
 *   inconsistency Task 13 removed between the catalog and the detail page.
 *
 * A non-`ACTIVE` viewer is the caller's problem, not this function's: the
 * header passes `null` for a suspended viewer's role *and* drops their
 * profile flags. `role === null` still short-circuits both keys here anyway,
 * so no authenticated entry point can escape through a caller that passes
 * profile flags without a role.
 */
export function navKeysFor(role: string | null, profiles: NavProfiles = NO_PROFILES): NavKey[] {
  const keys: NavKey[] = ['listings']
  if (role === 'SELLER' || role === 'MANAGER') keys.push('buyers')
  if (role === null) return keys
  keys.push('dashboard', 'inbox')
  if (role === 'SELLER' && profiles.seller) keys.push('newListing')
  if (profiles.buyer) keys.push('profile')
  if (role === 'MANAGER') keys.push('admin')
  return keys
}
