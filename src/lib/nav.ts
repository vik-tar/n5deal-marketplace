import type { Role } from '@/generated/prisma/client'

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
/**
 * The largest number the header's unread badge prints before it gives up and
 * says "more than this". A count badge is a nudge, not a figure anyone reads
 * precisely, and three digits do not fit a circle sized for one or two — at
 * which point the pill either stretches and shifts every nav item beside it or
 * clips its own text.
 */
export const MAX_BADGE_COUNT = 99

/**
 * What the badge should print, or `null` when there should be no badge at all.
 *
 * A separate pure function rather than an inline ternary in `SiteNav`, for the
 * reason every rule in this module is: the interesting cases are the boundaries
 * — zero must render nothing rather than a circled `0`, and a negative or
 * non-finite count (which no query produces today, and which a future one
 * could) must not print `-1` or `NaN` in the header of every page. Those are
 * one-line assertions in a unit test and a hard thing to notice in a browser.
 */
export function unreadBadgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null
  const whole = Math.floor(count)
  return whole > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(whole)
}

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
 * `role` is the viewer's role, or `null` for an anonymous visitor — and it is
 * the real `Role`, not a bare `string`. An earlier signature took `string` to
 * keep this module free of a Prisma import, which it does not need to: `Role`
 * is reached through `import type`, erased at compile time, and both callers
 * (`site-header.tsx` and the landing page) are Server Components that already
 * import `Viewer` from `@/lib/authz` — which type-imports `Role` itself. The
 * loose type bought nothing and let `navKeysFor('MANGER')` compile into a
 * silently missing console link.
 *
 * `profiles` defaults to "neither", so a caller that knows only the role gets
 * back only the keys a role alone unlocks.
 *
 * The last two keys are the entry points to the two role-specific pages
 * (`/listings/new`, `/profile`). Each mirrors the guard its own page applies,
 * and the two guards are genuinely different:
 *
 * - `/listings/new` calls `canPublishListing` (`@/lib/authz`), which requires
 *   an active `SELLER` *with* a `SellerProfile` — so both conditions appear
 *   here.
 * - `/profile` 404s on `viewer.buyerProfileId === null` and checks nothing
 *   else, so the nav gates on the profile row alone. Adding a `role ===
 *   'BUYER'` test here would be a stricter rule than the page enforces, and
 *   nav that hides a page the viewer can still open is the same class of
 *   inconsistency the catalog and the detail page avoid between them.
 *
 * `inbox` is withheld from a `MANAGER` for the same reason. A
 * manager holds neither a `BuyerProfile` nor a `SellerProfile`, so they are a
 * party to no conversation: `listConversations` returns them an empty list
 * and `getConversation` refuses them every thread — deliberately, because a
 * manager who can read every private negotiation is a privacy problem that
 * moderation does not need (see `@/server/queries/conversations` and the
 * README). Offering a nav item that can only ever lead to an empty page is
 * the inverse of the inconsistency the two keys below avoid, and an
 * always-empty inbox reads as a bug rather than as a decision. `/inbox`
 * itself still explains the situation to a manager who types the URL — the
 * nav is not the only place the rule is stated, just the first.
 *
 * A non-`ACTIVE` viewer is the caller's problem, not this function's: the
 * header passes `null` for a suspended viewer's role *and* drops their
 * profile flags. `role === null` still short-circuits both keys here anyway,
 * so no authenticated entry point can escape through a caller that passes
 * profile flags without a role.
 */
export function navKeysFor(role: Role | null, profiles: NavProfiles = NO_PROFILES): NavKey[] {
  const keys: NavKey[] = ['listings']
  if (role === 'SELLER' || role === 'MANAGER') keys.push('buyers')
  if (role === null) return keys
  keys.push('dashboard')
  if (role !== 'MANAGER') keys.push('inbox')
  if (role === 'SELLER' && profiles.seller) keys.push('newListing')
  if (profiles.buyer) keys.push('profile')
  if (role === 'MANAGER') keys.push('admin')
  return keys
}

/**
 * Which nav item, if any, the current pathname belongs to — the one that
 * earns `aria-current="page"`.
 *
 * `pathname` is the locale-stripped path `usePathname` (`@/i18n/navigation`)
 * returns, so it is compared against `NAV_HREF` unprefixed. A page counts as
 * belonging to an item when it *is* that item's target or lives beneath it, so
 * a listing detail page marks "Listings" current rather than nothing at all.
 *
 * Exactly one key can ever come back, and it is the most specific match:
 * `/listings/new` is beneath `/listings` *and* is `/listings/new`, and
 * announcing two current pages in one nav is worse than announcing none. The
 * longest matching target wins, which is the same rule a router would apply.
 *
 * `null` for a page that is no nav item's — the landing page, `/login`,
 * `/suspended` — and for a target the viewer is not offered: the caller passes
 * the keys `navKeysFor` gave it, so a buyer standing on a URL they typed by
 * hand cannot light up a nav item that is not rendered.
 *
 * Pure, and here rather than in the component, for the reason the whole module
 * is: this is a rule with edge cases, and edge cases belong in a unit test.
 */
export function activeNavKey(pathname: string, keys: readonly NavKey[]): NavKey | null {
  // `/listings/` and `/listings` are the same page; `/` is left alone, since
  // stripping it would leave the empty string and match nothing.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  let best: NavKey | null = null
  for (const key of keys) {
    const href = NAV_HREF[key]
    if (path !== href && !path.startsWith(`${href}/`)) continue
    if (best === null || href.length > NAV_HREF[best].length) best = key
  }
  return best
}

/**
 * Which entry points the landing hero offers a signed-in viewer, most
 * specific first — the first is rendered as the primary button, the second as
 * the secondary one.
 *
 * The hero's two buttons are "Start Buying" and "Start Selling", both
 * pointing at `/login` (`SIGN_IN_HREF`) as the spec requires. That is right
 * for the audience the page was written for and wrong for the audience it
 * actually gets first: `signInAction` sends a signed-in viewer to `/`, and
 * `/login` bounces an active viewer straight back — so for every signed-in
 * user, the first screen after sign-in has two buttons that do nothing at
 * all. Retargeting the buttons would be a spec deviation; offering a
 * signed-in viewer a different pair is not, because the spec's pair is a call
 * to action for an anonymous visitor and a signed-in viewer is not one.
 *
 * The keys are filtered through `navKeysFor` rather than re-derived, so this
 * function cannot offer a destination the header hides — `/listings/new`
 * needs an active `SELLER` *with* a `SellerProfile`, and every reason that
 * rule looks the way it does is written above, once. A hero button and a nav
 * item pointing at the same page under two different rules is the
 * inconsistency the catalog and the detail page avoid between them.
 *
 * An anonymous visitor gets an empty list and the hero renders the spec's
 * pair. `role === null` short-circuits before `navKeysFor` for the same
 * reason that function short-circuits internally: its anonymous answer is
 * `['listings']`, and "Browse listings" alone is not a hero.
 */
export const HERO_CTA_ORDER: readonly NavKey[] = ['newListing', 'dashboard', 'listings']

/**
 * `HERO_CTA_ORDER` deliberately stops at three keys. `profile` and `inbox`
 * are both reachable destinations for some viewers, but `listings` is
 * unconditional for every non-null role in `navKeysFor`, so any key ordered
 * after it could never be selected — and this codebase has already deleted
 * one guard that could not fail (`listAssets`' per-row `canViewAsset`)
 * precisely because a rule that cannot change an outcome reads to
 * the next maintainer as a rule that is doing something. Anything added here
 * must go *before* `listings` to mean anything.
 *
 * Every non-null role therefore yields exactly two keys: `dashboard` and
 * `listings` are both unconditional above, so the slice is never short.
 *
 * A manager's `dashboard` button lands on `/admin` rather than `/dashboard`,
 * because `/dashboard` redirects a manager to the console (see `redirectNow`'s
 * doc in `@/server/session`). That is not a mismatch to fix here: the header's
 * own `Dashboard` item behaves the same way, and teaching this function about
 * the redirect would be a second copy of a rule the destination page already
 * owns.
 *
 * A suspended viewer is the caller's problem, exactly as with `navKeysFor` —
 * the landing page passes `null` for one, which is correct twice over, since
 * `/dashboard` would only bounce them to `/suspended` and `/login` at least
 * tells them why.
 */
export function heroCtaKeys(role: Role | null, profiles: NavProfiles = NO_PROFILES): NavKey[] {
  if (role === null) return []
  const allowed = new Set(navKeysFor(role, profiles))
  return HERO_CTA_ORDER.filter((key) => allowed.has(key)).slice(0, 2)
}
