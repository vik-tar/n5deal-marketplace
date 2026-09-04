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

  it('omits empty facets so they do not overwrite existing filters', () => {
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
})
