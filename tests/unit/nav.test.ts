import { describe, expect, it } from 'vitest'
import { navKeysFor } from '@/lib/nav'

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

  // "Everything a role alone unlocks" — the profile-gated keys Task 18 added
  // (`newListing`, `profile`) are deliberately absent here, because this
  // asserts the default no-profiles call. Their own cases are below.
  it('gives a manager every role-gated key, including admin', () => {
    expect(navKeysFor('MANAGER')).toEqual([
      'listings',
      'buyers',
      'dashboard',
      'admin',
    ])
  })

  /**
   * Task 19: a manager is a party to no conversation — they hold neither
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
    for (const role of [null, 'BUYER', 'SELLER']) {
      expect(navKeysFor(role)).not.toContain('admin')
    }
  })
})

/**
 * Task 18's handoff 3: `/profile` (Task 16) and `/listings/new` (Task 15)
 * shipped finished but unreachable from any UI. These assert the two new
 * entry points appear for exactly the viewers whose own pages would let them
 * in, and for nobody else.
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
