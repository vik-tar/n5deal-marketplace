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

  it('gives a manager everything, including admin', () => {
    expect(navKeysFor('MANAGER')).toEqual([
      'listings',
      'buyers',
      'dashboard',
      'inbox',
      'admin',
    ])
  })

  it('never exposes admin to a non-manager', () => {
    for (const role of [null, 'BUYER', 'SELLER']) {
      expect(navKeysFor(role)).not.toContain('admin')
    }
  })
})
