import { describe, expect, it } from 'vitest'
import { buyerFiltersToSearchParams, parseBuyerFilters } from '@/lib/filters/buyer-filters'

describe('parseBuyerFilters', () => {
  it('returns defaults for empty input', () => {
    expect(parseBuyerFilters({})).toEqual({
      q: '',
      buyerTypes: [],
      categories: [],
      countries: [],
      ticketMinCents: null,
      page: 1,
    })
  })

  it('parses a comma-separated buyerTypes list', () => {
    expect(parseBuyerFilters({ buyerTypes: 'PE_FUND,STRATEGIC' }).buyerTypes).toEqual([
      'PE_FUND',
      'STRATEGIC',
    ])
  })

  it('parses a repeated buyerTypes parameter', () => {
    expect(parseBuyerFilters({ buyerTypes: ['PE_FUND', 'INDIVIDUAL'] }).buyerTypes).toEqual([
      'PE_FUND',
      'INDIVIDUAL',
    ])
  })

  it('drops unknown buyerTypes but keeps valid ones', () => {
    expect(parseBuyerFilters({ buyerTypes: 'PE_FUND,UNKNOWN' }).buyerTypes).toEqual(['PE_FUND'])
  })

  it('parses mandate categories', () => {
    expect(parseBuyerFilters({ categories: 'BANK,FINTECH' }).categories).toEqual([
      'BANK',
      'FINTECH',
    ])
  })

  it('drops unknown categories but keeps valid ones', () => {
    expect(parseBuyerFilters({ categories: 'BANK,WOMBAT' }).categories).toEqual(['BANK'])
  })

  it('uppercases country codes and drops malformed ones', () => {
    expect(parseBuyerFilters({ countries: 'mt,GBR,gb' }).countries).toEqual(['MT', 'GB'])
  })

  it('deduplicates repeated country values', () => {
    expect(parseBuyerFilters({ countries: 'MT,MT,gb,GB' }).countries).toEqual(['MT', 'GB'])
  })

  it('reads ticketMin as euros and stores cents', () => {
    expect(parseBuyerFilters({ ticketMin: '50000' }).ticketMinCents).toBe(50_000_00)
  })

  it('returns null for ticketMin when not provided', () => {
    expect(parseBuyerFilters({}).ticketMinCents).toBe(null)
  })

  it('clamps a nonsensical page number', () => {
    expect(parseBuyerFilters({ page: '-5' }).page).toBe(1)
    expect(parseBuyerFilters({ page: 'abc' }).page).toBe(1)
  })

  it('accepts a valid page number', () => {
    expect(parseBuyerFilters({ page: '5' }).page).toBe(5)
  })

  it('truncates an overlong search string instead of rejecting it', () => {
    expect(parseBuyerFilters({ q: 'x'.repeat(500) }).q).toHaveLength(200)
  })
})

describe('buyerFiltersToSearchParams', () => {
  it('omits defaults so shared URLs stay short', () => {
    expect(buyerFiltersToSearchParams({ page: 1 }).toString()).toBe('')
  })

  it('serialises buyerTypes array as comma list', () => {
    const sp = buyerFiltersToSearchParams({ buyerTypes: ['PE_FUND', 'STRATEGIC'] })
    expect(sp.get('buyerTypes')).toBe('PE_FUND,STRATEGIC')
  })

  it('serialises categories array as comma list', () => {
    const sp = buyerFiltersToSearchParams({ categories: ['BANK', 'FINTECH'] })
    expect(sp.get('categories')).toBe('BANK,FINTECH')
  })

  it('serialises countries array as comma list', () => {
    const sp = buyerFiltersToSearchParams({ countries: ['MT', 'GB'] })
    expect(sp.get('countries')).toBe('MT,GB')
  })

  it('serialises ticketMin in euros', () => {
    const sp = buyerFiltersToSearchParams({ ticketMinCents: 100_000_00 })
    expect(sp.get('ticketMin')).toBe('100000')
  })

  it('round-trips through parse without drift', () => {
    const original = parseBuyerFilters({
      buyerTypes: 'PE_FUND,FAMILY_OFFICE',
      categories: 'BANK',
      countries: 'MT',
      ticketMin: '250000',
      page: '3',
    })
    const reparsed = parseBuyerFilters(
      Object.fromEntries(buyerFiltersToSearchParams(original)),
    )
    expect(reparsed).toEqual(original)
  })
})
