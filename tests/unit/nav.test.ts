import { describe, expect, it } from 'vitest'
import type { Role } from '@/generated/prisma/client'
import {
  HERO_CTA_ORDER,
  MAX_BADGE_COUNT,
  activeNavKey,
  heroCtaKeys,
  navKeysFor,
  unreadBadgeLabel,
} from '@/lib/nav'

/** Every role, for the exhaustive sweeps below. */
const ROLES = ['BUYER', 'SELLER', 'MANAGER'] as const satisfies readonly Role[]
const ROLES_AND_ANONYMOUS = [null, ...ROLES] as const

describe('navKeysFor', () => {
  it('shows only the catalog to an anonymous visitor', () => {
    expect(navKeysFor(null)).toEqual(['listings'])
  })

  it('gives a buyer the catalog, dashboard and inbox but no buyer directory', () => {
    expect(navKeysFor('BUYER')).toEqual(['listings', 'dashboard', 'inbox'])
  })

  it('gives a seller the buyer directory', () => {
    expect(navKeysFor('SELLER')).toEqual([
      'listings',
      'buyers',
      'dashboard',
      'inbox',
    ])
  })

  // "Everything a role alone unlocks" — the profile-gated keys (`newListing`,
  // `profile`) are deliberately absent here, because this asserts the default
  // no-profiles call. Their own cases are below.
  it('gives a manager every role-gated key, including admin', () => {
    expect(navKeysFor('MANAGER')).toEqual([
      'listings',
      'buyers',
      'dashboard',
      'admin',
    ])
  })

  /**
   * a manager is a party to no conversation — they hold neither
   * profile row, so `listConversations` returns them nothing and
   * `getConversation` refuses them every thread by design. A nav item that
   * can only ever lead to an empty page is the same inconsistency the
   * profile-gated keys below avoid, pointed the other way.
   */
  it('never offers the inbox to a manager', () => {
    expect(navKeysFor('MANAGER')).not.toContain('inbox')
    expect(navKeysFor('MANAGER', { buyer: false, seller: false })).not.toContain('inbox')
  })

  it('still offers the inbox to both trading roles', () => {
    expect(navKeysFor('BUYER')).toContain('inbox')
    expect(navKeysFor('SELLER')).toContain('inbox')
  })

  it('never exposes admin to a non-manager', () => {
    for (const role of [null, 'BUYER', 'SELLER'] as const) {
      expect(navKeysFor(role)).not.toContain('admin')
    }
  })
})

/**
 * The two role-specific entry points, `/profile` and `/listings/new`. These
 * assert that each appears for exactly the viewers whose own page would let
 * them in, and for nobody else.
 */
describe('navKeysFor — role-specific entry points', () => {
  it('shows /profile to a buyer who has a buyer profile', () => {
    expect(navKeysFor('BUYER', { buyer: true, seller: false })).toEqual([
      'listings',
      'dashboard',
      'inbox',
      'profile',
    ])
  })

  it('shows /listings/new to a seller who has a seller profile', () => {
    expect(navKeysFor('SELLER', { buyer: false, seller: true })).toEqual([
      'listings',
      'buyers',
      'dashboard',
      'inbox',
      'newListing',
    ])
  })

  /**
   * `canPublishListing` (`@/lib/authz`) requires an active SELLER *with* a
   * `SellerProfile`; a seller row-less account would hit the 404 on
   * `/listings/new`, so the nav must not offer it.
   */
  it('hides /listings/new from a seller with no seller profile', () => {
    expect(navKeysFor('SELLER')).not.toContain('newListing')
    expect(navKeysFor('SELLER', { buyer: false, seller: false })).not.toContain('newListing')
  })

  it('hides /profile from a buyer with no buyer profile', () => {
    expect(navKeysFor('BUYER')).not.toContain('profile')
  })

  /**
   * `canPublishListing` is role-gated as well as profile-gated, and a manager
   * moderates the market rather than selling in it.
   */
  it('never offers /listings/new to a manager, profile row or not', () => {
    expect(navKeysFor('MANAGER', { buyer: false, seller: true })).not.toContain('newListing')
  })

  /**
   * `/profile` itself checks only `buyerProfileId !== null`, so the nav
   * mirrors that rather than adding a stricter role test the page does not
   * enforce.
   */
  it('offers /profile to any signed-in viewer holding a buyer profile', () => {
    expect(navKeysFor('MANAGER', { buyer: true, seller: false })).toContain('profile')
  })

  it('never offers either entry point to an anonymous visitor', () => {
    expect(navKeysFor(null, { buyer: true, seller: true })).toEqual(['listings'])
  })
})

/**
 * The landing hero's two buttons.
 *
 * `signInAction` sends a signed-in viewer to `/`, so the landing page is the
 * first screen after every sign-in — and the spec's "Start Buying" / "Start
 * Selling" both point at `/login`, which redirects an active viewer straight
 * back. Both controls therefore did nothing at all for the majority audience.
 * These assert the replacement pair is drawn from what `navKeysFor` already
 * allows, so a hero button can never offer a page the header hides.
 */
describe('heroCtaKeys', () => {
  it('offers an anonymous visitor nothing, so the hero keeps the spec pair', () => {
    expect(heroCtaKeys(null)).toEqual([])
    expect(heroCtaKeys(null, { buyer: true, seller: true })).toEqual([])
  })

  it('gives a seller who can publish the new-listing button first', () => {
    expect(heroCtaKeys('SELLER', { buyer: false, seller: true })).toEqual([
      'newListing',
      'dashboard',
    ])
  })

  it('falls back to the dashboard for a seller with no seller profile', () => {
    expect(heroCtaKeys('SELLER')).toEqual(['dashboard', 'listings'])
  })

  it('gives a buyer the dashboard and the catalog', () => {
    expect(heroCtaKeys('BUYER', { buyer: true, seller: false })).toEqual([
      'dashboard',
      'listings',
    ])
  })

  /**
   * A manager holds no seller profile, so `newListing` is unreachable for
   * them however they are asked — including with a stray `seller: true`,
   * which `navKeysFor` already refuses on the role alone.
   */
  it('never offers a manager the new-listing button', () => {
    expect(heroCtaKeys('MANAGER', { buyer: false, seller: true })).toEqual([
      'dashboard',
      'listings',
    ])
  })

  /**
   * The property the hero's layout depends on: a signed-in viewer always gets
   * exactly two buttons, one primary and one secondary. It holds because
   * `dashboard` and `listings` are both unconditional in `navKeysFor` for any
   * non-null role, so the slice can never come up short.
   */
  it('returns exactly two keys for every signed-in viewer', () => {
    for (const role of ROLES) {
      for (const buyer of [false, true]) {
        for (const seller of [false, true]) {
          expect(heroCtaKeys(role, { buyer, seller }), `${role} ${buyer} ${seller}`).toHaveLength(2)
        }
      }
    }
  })

  /**
   * The whole point of routing through `navKeysFor` rather than restating its
   * rules: no CTA may point somewhere the nav would not offer the same
   * viewer.
   */
  it('never offers a key navKeysFor withholds', () => {
    for (const role of ROLES_AND_ANONYMOUS) {
      for (const buyer of [false, true]) {
        for (const seller of [false, true]) {
          const profiles = { buyer, seller }
          const allowed = navKeysFor(role, profiles)
          for (const key of heroCtaKeys(role, profiles)) {
            expect(allowed, `${role} ${buyer} ${seller}`).toContain(key)
          }
        }
      }
    }
  })

  /**
   * `HERO_CTA_ORDER` must not grow a key after `listings`: that one is
   * unconditional for every non-null role, so anything ordered behind it
   * could never be selected, and this codebase has already deleted one guard
   * that could not fail (`listAssets`' per-row `canViewAsset`) rather than leave
   * it reading as a rule that does something.
   */
  it('keeps every candidate reachable, with listings last', () => {
    expect(HERO_CTA_ORDER[HERO_CTA_ORDER.length - 1]).toBe('listings')
    const selectable = new Set<string>()
    for (const role of ROLES) {
      for (const buyer of [false, true]) {
        for (const seller of [false, true]) {
          for (const key of heroCtaKeys(role, { buyer, seller })) selectable.add(key)
        }
      }
    }
    expect([...selectable].sort()).toEqual([...HERO_CTA_ORDER].sort())
  })
})

describe('activeNavKey', () => {
  const manager = navKeysFor('MANAGER', { buyer: false, seller: false })
  const seller = navKeysFor('SELLER', { buyer: false, seller: true })

  it('marks the item whose page the viewer is on', () => {
    expect(activeNavKey('/listings', seller)).toBe('listings')
    expect(activeNavKey('/buyers', seller)).toBe('buyers')
    expect(activeNavKey('/admin', manager)).toBe('admin')
  })

  it('marks the parent item on a page beneath it', () => {
    expect(activeNavKey('/listings/cm0abc123', seller)).toBe('listings')
    expect(activeNavKey('/listings/cm0abc123/edit', seller)).toBe('listings')
    expect(activeNavKey('/inbox/cm0thread1', navKeysFor('BUYER'))).toBe('inbox')
  })

  /**
   * `/listings/new` is beneath `/listings` and is also its own nav item.
   * Announcing two current pages in one nav is worse than announcing none,
   * so the longest matching target wins — the rule a router would apply.
   */
  it('prefers the most specific item when two targets match', () => {
    expect(activeNavKey('/listings/new', seller)).toBe('newListing')
  })

  it('marks nothing on a page that is no nav item', () => {
    expect(activeNavKey('/', seller)).toBeNull()
    expect(activeNavKey('/login', navKeysFor(null))).toBeNull()
    expect(activeNavKey('/suspended', navKeysFor(null))).toBeNull()
  })

  /**
   * A prefix match must respect the path separator: `/listings-archive`
   * is not a page beneath `/listings`.
   */
  it('does not match a sibling path that merely starts with a target', () => {
    expect(activeNavKey('/listingsomething', seller)).toBeNull()
  })

  it('treats a trailing slash as the same page', () => {
    expect(activeNavKey('/listings/', seller)).toBe('listings')
  })

  /**
   * The caller passes the keys `navKeysFor` gave it, so a viewer standing on
   * a URL they typed by hand cannot light up an item that is not rendered.
   */
  it('never returns a key the viewer was not offered', () => {
    expect(activeNavKey('/admin', navKeysFor('BUYER'))).toBeNull()
    expect(activeNavKey('/dashboard', navKeysFor(null))).toBeNull()
  })

  it('marks at most one item, for every offered key set', () => {
    const paths = ['/', '/listings', '/listings/new', '/listings/x', '/buyers', '/dashboard',
      '/inbox', '/inbox/x', '/profile', '/admin', '/login']
    for (const role of ROLES_AND_ANONYMOUS) {
      for (const buyer of [false, true]) {
        for (const seller_ of [false, true]) {
          const keys = navKeysFor(role, { buyer, seller: seller_ })
          for (const path of paths) {
            const key = activeNavKey(path, keys)
            if (key !== null) expect(keys, `${role} ${path}`).toContain(key)
          }
        }
      }
    }
  })
})

/**
 * The header's unread badge. Every case here is a boundary the browser makes
 * hard to see and a unit test makes trivial: a circled `0` on a header that
 * should carry no badge at all, or `NaN`/`-1` printed on every page of the app
 * the day a count arrives from somewhere that can produce one.
 */
describe('unreadBadgeLabel', () => {
  it('renders nothing at zero — an empty inbox gets no circle', () => {
    expect(unreadBadgeLabel(0)).toBeNull()
  })

  it('renders the count itself up to the cap', () => {
    expect(unreadBadgeLabel(1)).toBe('1')
    expect(unreadBadgeLabel(2)).toBe('2')
    expect(unreadBadgeLabel(MAX_BADGE_COUNT)).toBe(String(MAX_BADGE_COUNT))
  })

  it('stops counting past the cap rather than widening the circle', () => {
    expect(unreadBadgeLabel(MAX_BADGE_COUNT + 1)).toBe(`${MAX_BADGE_COUNT}+`)
    expect(unreadBadgeLabel(100_000)).toBe(`${MAX_BADGE_COUNT}+`)
  })

  it('renders nothing for a count no query should ever produce', () => {
    for (const count of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(unreadBadgeLabel(count), String(count)).toBeNull()
    }
  })

  it('never prints a fraction', () => {
    expect(unreadBadgeLabel(2.7)).toBe('2')
  })
})
