import { describe, expect, it } from 'vitest'
import { buildSearchPrompt, toFilterPatch } from '@/lib/ai/search'

describe('buildSearchPrompt', () => {
  it('includes the user query verbatim', () => {
    expect(buildSearchPrompt('EMI licence in Malta under 2M')).toContain(
      'EMI licence in Malta under 2M',
    )
  })

  it('truncates a hostile input to the filter length limit', () => {
    expect(buildSearchPrompt('x'.repeat(5000)).length).toBeLessThan(1000)
  })
})

describe('toFilterPatch', () => {
  it('converts euros to cents', () => {
    const patch = toFilterPatch({
      categories: [],
      countries: [],
      businessStatuses: [],
      priceMinEur: null,
      priceMaxEur: 2_000_000,
      freeText: '',
    })
    expect(patch.priceMaxCents).toBe(2_000_000_00)
  })

  it('drops country codes that are not two letters', () => {
    const patch = toFilterPatch({
      categories: ['EMI'],
      countries: ['MT', 'Malta', 'gb'],
      businessStatuses: [],
      priceMinEur: null,
      priceMaxEur: null,
      freeText: '',
    })
    expect(patch.countries).toEqual(['MT', 'GB'])
  })

  it('omits empty structured facets, but always sets q explicitly', () => {
    const patch = toFilterPatch({
      categories: [],
      countries: [],
      businessStatuses: [],
      priceMinEur: null,
      priceMaxEur: null,
      freeText: 'crypto',
    })
    expect(patch).toEqual({ q: 'crypto' })
  })

  it('sets q to the empty string — not omitted — when the result is fully structured', () => {
    // A stale `q` from an earlier plain search must not survive a merge with
    // a patch the AI expressed entirely as structured filters: `handleAskAi`
    // spreads `{ ...filters, ...patch }`, so an *omitted* `q` here would
    // silently inherit whatever `q` the URL already had, showing the user a
    // filter chip the AI never proposed. `q` must be a key of the patch
    // (explicitly cleared), not merely absent.
    const patch = toFilterPatch({
      categories: ['EMI'],
      countries: ['MT'],
      businessStatuses: [],
      priceMinEur: null,
      priceMaxEur: null,
      freeText: '   ',
    })
    expect(patch.q).toBe('')
    expect('q' in patch).toBe(true)
    expect(patch.categories).toEqual(['EMI'])
    expect(patch.countries).toEqual(['MT'])
  })
})
