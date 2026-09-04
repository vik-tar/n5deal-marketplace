import { describe, expect, it } from 'vitest'
import { ASSETS } from '../../../prisma/seed-data/assets'

const LICENCE_TYPE_UNIVERSE = ['EMI', 'SEMI', 'MSO', 'PI', 'API', 'CASP', 'Banking']

describe('ASSETS fixture', () => {
  it('has exactly 40 entries with a unique N5-701..N5-740 publicRef set', () => {
    expect(ASSETS).toHaveLength(40)
    const refs = ASSETS.map((a) => a.publicRef)
    expect(new Set(refs).size).toBe(40)
    const expected = Array.from({ length: 40 }, (_, i) => `N5-${701 + i}`)
    expect([...refs].sort()).toEqual([...expected].sort())
  })

  it('includes all five categories, with PAYMENT the most common', () => {
    const counts = new Map<string, number>()
    for (const a of ASSETS) counts.set(a.category, (counts.get(a.category) ?? 0) + 1)
    expect(new Set(ASSETS.map((a) => a.category)).size).toBe(5)
    const paymentCount = counts.get('PAYMENT') ?? 0
    for (const [category, count] of counts) {
      if (category !== 'PAYMENT') expect(paymentCount).toBeGreaterThan(count)
    }
  })

  it('uses every licence type in the fixed universe at least once (regression: the EMI-never-appears bug)', () => {
    const seen = new Set(ASSETS.map((a) => a.licenceType))
    for (const licenceType of LICENCE_TYPE_UNIVERSE) {
      expect(seen.has(licenceType)).toBe(true)
    }
  })

  it('gives every category with more than 5 listings at least 4 distinct licence types and 4 distinct business types (regression: block-level occurrence aliasing)', () => {
    const byCategory = new Map<string, { licenceTypes: Set<string>; businessTypes: Set<string>; count: number }>()
    for (const a of ASSETS) {
      const entry = byCategory.get(a.category) ?? { licenceTypes: new Set(), businessTypes: new Set(), count: 0 }
      entry.licenceTypes.add(a.licenceType)
      entry.businessTypes.add(a.businessType)
      entry.count += 1
      byCategory.set(a.category, entry)
    }
    for (const [category, entry] of byCategory) {
      if (entry.count > 5) {
        expect(entry.licenceTypes.size, `${category} licence types`).toBeGreaterThanOrEqual(4)
        expect(entry.businessTypes.size, `${category} business types`).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('prices every listing between EUR 150,000 and EUR 25,000,000 (in cents)', () => {
    const min = BigInt(15_000_000)
    const max = BigInt(2_500_000_000)
    for (const a of ASSETS) {
      expect(a.askingPriceCents >= min && a.askingPriceCents <= max).toBe(true)
    }
  })

  it('has the exact required status distribution', () => {
    const counts = new Map<string, number>()
    for (const a of ASSETS) counts.set(a.status, (counts.get(a.status) ?? 0) + 1)
    expect(counts.get('PUBLISHED')).toBe(35)
    expect(counts.get('PENDING_REVIEW')).toBe(2)
    expect(counts.get('SOLD')).toBe(1)
    expect(counts.get('REJECTED')).toBe(1)
    expect(counts.get('DRAFT')).toBe(1)
  })

  it('spans at least 15 distinct countries', () => {
    expect(new Set(ASSETS.map((a) => a.country)).size).toBeGreaterThanOrEqual(15)
  })

  it('leaks exactly one legal name into its own teaser, and it is N5-740', () => {
    const leaking = ASSETS.filter((a) => {
      const haystack = `${a.teaserTitle} ${a.teaserDescription}`.toLowerCase()
      return haystack.includes(a.legalName.toLowerCase())
    })
    expect(leaking).toHaveLength(1)
    expect(leaking[0]?.publicRef).toBe('N5-740')
  })

  it('never spells out an asset\'s own confidential revenue or EBITDA figure in its teaser', () => {
    // A euro amount of exactly 0 (every LICENSE_ONLY listing has no revenue)
    // is not a confidential figure worth checking for — "0" would trivially
    // match inside any year like "2011", making that case meaningless noise
    // rather than a real leak signal. Non-zero amounts are all at least
    // 4-5 digits here, so they are not vulnerable to that false-positive.
    for (const a of ASSETS) {
      const haystack = `${a.teaserTitle} ${a.teaserDescription}`
      const revenueEur = Number(a.revenueCents / BigInt(100))
      const ebitdaEur = Math.abs(Number(a.ebitdaCents / BigInt(100)))
      if (revenueEur !== 0) expect(haystack).not.toContain(String(revenueEur))
      if (ebitdaEur !== 0) expect(haystack).not.toContain(String(ebitdaEur))
    }
  })
})
