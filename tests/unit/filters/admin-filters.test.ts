import { describe, expect, it } from 'vitest'
import {
  ADMIN_TABS,
  adminFiltersToSearchParams,
  parseAdminFilters,
  type AdminFilters,
} from '@/lib/filters/admin-filters'

/** `parseAdminFilters({})` gives the exact default shape; overrides layer on top. */
function makeFilters(overrides: Partial<AdminFilters> = {}): AdminFilters {
  return { ...parseAdminFilters({}), ...overrides }
}

describe('parseAdminFilters', () => {
  it('defaults to the participants tab with nothing filtered', () => {
    expect(parseAdminFilters({})).toEqual({
      tab: 'participants',
      roles: [],
      userStatuses: [],
      q: '',
      assetStatuses: [],
    })
  })

  it('accepts every configured tab', () => {
    for (const tab of ADMIN_TABS) {
      expect(parseAdminFilters({ tab }).tab).toBe(tab)
    }
  })

  it('falls back to the default tab for an unknown or repeated value', () => {
    expect(parseAdminFilters({ tab: 'settings' }).tab).toBe('participants')
    expect(parseAdminFilters({ tab: '' }).tab).toBe('participants')
    // A repeated parameter yields an array; only the first value is read, and
    // it still has to be a real tab.
    expect(parseAdminFilters({ tab: ['log', 'assets'] }).tab).toBe('log')
    expect(parseAdminFilters({ tab: ['nope', 'log'] }).tab).toBe('participants')
  })

  it('keeps only known roles and statuses, dropping anything else', () => {
    const filters = parseAdminFilters({
      roles: 'SELLER,ADMIN,BUYER',
      userStatuses: 'SUSPENDED,DELETED',
      assetStatuses: 'PENDING_REVIEW,LIMBO,SOLD',
    })
    expect(filters.roles).toEqual(['SELLER', 'BUYER'])
    expect(filters.userStatuses).toEqual(['SUSPENDED'])
    expect(filters.assetStatuses).toEqual(['PENDING_REVIEW', 'SOLD'])
  })

  it('accepts both the repeated and the comma-joined parameter forms', () => {
    expect(parseAdminFilters({ roles: ['SELLER', 'BUYER'] }).roles).toEqual(['SELLER', 'BUYER'])
    expect(parseAdminFilters({ roles: 'SELLER,BUYER' }).roles).toEqual(['SELLER', 'BUYER'])
  })

  it('trims and caps the search text', () => {
    expect(parseAdminFilters({ q: '  quicklicence  ' }).q).toBe('quicklicence')
    expect(parseAdminFilters({ q: 'x'.repeat(500) }).q).toHaveLength(200)
  })

  /**
   * A hostile or malformed query string must degrade to the default view
   * rather than throw — the same property `parseAssetFilters` and
   * `parseBuyerFilters` are asserted for, because this parser runs on a URL
   * anybody can type.
   */
  it('survives a hostile query string with defaults', () => {
    expect(
      parseAdminFilters({
        tab: ['../../etc/passwd'],
        roles: ',,,',
        userStatuses: 'ACTIVE;DROP TABLE',
        assetStatuses: '',
        q: undefined,
      }),
    ).toEqual({
      tab: 'participants',
      roles: [],
      userStatuses: [],
      q: '',
      assetStatuses: [],
    })
  })
})

describe('adminFiltersToSearchParams', () => {
  it('writes nothing for the default view, so /admin is one URL and not two', () => {
    expect(adminFiltersToSearchParams(makeFilters()).toString()).toBe('')
    expect(adminFiltersToSearchParams(makeFilters({ tab: 'participants' })).toString()).toBe('')
  })

  it('writes a non-default tab', () => {
    expect(adminFiltersToSearchParams(makeFilters({ tab: 'log' })).get('tab')).toBe('log')
  })

  /**
   * The round trip is what makes a filtered console view shareable: every
   * link on the page is built from the current filters, so anything the
   * serializer drops is a filter that silently resets when a manager changes
   * tab.
   */
  it('round-trips every field through parse', () => {
    const filters = makeFilters({
      tab: 'assets',
      roles: ['SELLER', 'MANAGER'],
      userStatuses: ['SUSPENDED', 'REMOVED'],
      q: 'baltic',
      assetStatuses: ['PENDING_REVIEW', 'PUBLISHED'],
    })
    const sp = adminFiltersToSearchParams(filters)
    expect(parseAdminFilters(Object.fromEntries(sp))).toEqual(filters)
  })

  it('carries the other tabs’ filters through a tab switch', () => {
    const filters = makeFilters({
      tab: 'participants',
      roles: ['SELLER'],
      assetStatuses: ['PENDING_REVIEW'],
    })
    const switched = parseAdminFilters(
      Object.fromEntries(adminFiltersToSearchParams({ ...filters, tab: 'assets' })),
    )
    expect(switched.tab).toBe('assets')
    expect(switched.roles).toEqual(['SELLER'])
    expect(switched.assetStatuses).toEqual(['PENDING_REVIEW'])
  })
})
