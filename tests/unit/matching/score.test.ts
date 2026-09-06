import { describe, expect, it } from 'vitest'
import {
  isMandateRankable,
  isRecommendableMatch,
  mandateSpecificity,
  RECOMMENDABLE_BANDS,
  scoreMatch,
} from '@/lib/matching'
import type { AssetCriteria, MandateCriteria } from '@/lib/matching'

const asset: AssetCriteria = {
  category: 'EMI',
  country: 'MT',
  licenceType: 'SEMI',
  businessStatus: 'ACTIVE',
  askingPriceCents: 1_000_000_00,
}

const narrowMandate: MandateCriteria = {
  categories: ['EMI'],
  countries: ['MT'],
  licenceTypes: ['SEMI'],
  businessStatuses: ['ACTIVE'],
  ticketMinCents: 500_000_00,
  ticketMaxCents: 1_500_000_00,
}

const emptyMandate: MandateCriteria = {
  categories: [],
  countries: [],
  licenceTypes: [],
  businessStatuses: [],
  ticketMinCents: null,
  ticketMaxCents: null,
}

describe('scoreMatch', () => {
  it('scores a perfect match at 100 in the strong band', () => {
    const result = scoreMatch(narrowMandate, asset)
    expect(result.score).toBe(100)
    expect(result.band).toBe('STRONG')
  })

  it('treats an unfilled mandate as no preference rather than a mismatch', () => {
    const result = scoreMatch(emptyMandate, asset)
    expect(result.score).toBe(100)
    expect(result.reasons.every((r) => r.kind === 'NO_PREFERENCE')).toBe(true)
  })

  it('drops the category weight when the category is wrong', () => {
    const result = scoreMatch({ ...narrowMandate, categories: ['BANK'] }, asset)
    expect(result.score).toBe(70)
    expect(result.reasons.find((r) => r.code === 'CATEGORY')?.kind).toBe('MISMATCH')
  })

  it('falls to the good band when category and country both miss', () => {
    const result = scoreMatch(
      { ...narrowMandate, categories: ['BANK'], countries: ['GB'] },
      asset,
    )
    expect(result.score).toBe(50)
    expect(result.band).toBe('GOOD')
  })

  it('gives half the price weight just outside the ticket band', () => {
    const result = scoreMatch({ ...narrowMandate, ticketMaxCents: 900_000_00 }, asset)
    expect(result.reasons.find((r) => r.code === 'PRICE')?.kind).toBe('PARTIAL')
    expect(result.score).toBe(88)
  })

  it('gives no price weight far outside the ticket band', () => {
    const result = scoreMatch({ ...narrowMandate, ticketMaxCents: 400_000_00 }, asset)
    expect(result.reasons.find((r) => r.code === 'PRICE')?.kind).toBe('MISMATCH')
    expect(result.score).toBe(75)
  })

  it('treats an open-ended upper bound as unbounded', () => {
    const result = scoreMatch({ ...narrowMandate, ticketMaxCents: null }, asset)
    expect(result.reasons.find((r) => r.code === 'PRICE')?.kind).toBe('MATCH')
  })

  it('returns no band when nothing matches', () => {
    const result = scoreMatch(
      {
        categories: ['BANK'],
        countries: ['GB'],
        licenceTypes: ['FCA-AP'],
        businessStatuses: ['LICENSE_ONLY'],
        ticketMinCents: 10_000_000_00,
        ticketMaxCents: 20_000_000_00,
      },
      asset,
    )
    expect(result.score).toBe(0)
    expect(result.band).toBe('NONE')
  })

  it('returns exactly one reason per criterion', () => {
    const codes = scoreMatch(narrowMandate, asset).reasons.map((r) => r.code)
    expect(codes).toEqual([
      'CATEGORY',
      'COUNTRY',
      'PRICE',
      'BUSINESS_STATUS',
      'LICENCE_TYPE',
    ])
  })
})

describe('scoreMatch specificity', () => {
  it('reports zero for a mandate that constrains nothing', () => {
    expect(scoreMatch(emptyMandate, asset).specificity).toBe(0)
  })

  it('reports five for a fully specified mandate', () => {
    expect(scoreMatch(narrowMandate, asset).specificity).toBe(5)
  })

  it('counts a ticket band as one criterion however it is bounded', () => {
    const base = { ...emptyMandate, ticketMinCents: 1_00, ticketMaxCents: null }
    expect(scoreMatch(base, asset).specificity).toBe(1)
    expect(scoreMatch({ ...base, ticketMinCents: null, ticketMaxCents: 1_00 }, asset).specificity).toBe(1)
    expect(scoreMatch({ ...base, ticketMinCents: 1_00, ticketMaxCents: 2_00 }, asset).specificity).toBe(1)
  })

  it('counts only the criteria that are filled in', () => {
    expect(scoreMatch({ ...emptyMandate, categories: ['EMI'] }, asset).specificity).toBe(1)
    expect(
      scoreMatch({ ...emptyMandate, categories: ['EMI'], countries: ['MT'] }, asset).specificity,
    ).toBe(2)
  })

  it('leaves the score and band untouched', () => {
    const result = scoreMatch(emptyMandate, asset)
    expect(result.score).toBe(100)
    expect(result.band).toBe('STRONG')
  })
})

describe('mandateSpecificity', () => {
  it('is exported standalone, independent of any asset, and agrees with scoreMatch', () => {
    expect(mandateSpecificity(emptyMandate)).toBe(0)
    expect(mandateSpecificity(narrowMandate)).toBe(5)
    expect(mandateSpecificity(narrowMandate)).toBe(scoreMatch(narrowMandate, asset).specificity)
  })
})

describe('isMandateRankable', () => {
  /**
   * The rule Task 18's buyer dashboard turns on, asserted against the number
   * `scoreMatch` actually produces rather than against a hand-written 0: a
   * mandate that constrains nothing scores every listing at 100 in the
   * STRONG band, so ranking on that score would order listings by nothing.
   */
  it('refuses a mandate that constrains nothing, which scores every asset identically', () => {
    const result = scoreMatch(emptyMandate, asset)
    expect(result.specificity).toBe(0)
    expect(result.score).toBe(100)
    expect(result.band).toBe('STRONG')
    expect(isMandateRankable(result.specificity)).toBe(false)
  })

  it('allows every mandate that constrains at least one criterion', () => {
    for (let specificity = 1; specificity <= 5; specificity += 1) {
      expect(isMandateRankable(specificity)).toBe(true)
    }
  })

  it('agrees with the fully constrained mandate scoreMatch reports', () => {
    expect(isMandateRankable(scoreMatch(narrowMandate, asset).specificity)).toBe(true)
  })
})

describe('isRecommendableMatch', () => {
  it('keeps the two bands worth volunteering and drops NONE', () => {
    expect(RECOMMENDABLE_BANDS).toEqual(['STRONG', 'GOOD'])
    expect(isRecommendableMatch({ score: 100, band: 'STRONG', specificity: 5, reasons: [] })).toBe(true)
    expect(isRecommendableMatch({ score: 50, band: 'GOOD', specificity: 5, reasons: [] })).toBe(true)
    expect(isRecommendableMatch({ score: 30, band: 'NONE', specificity: 5, reasons: [] })).toBe(false)
  })

  /**
   * Against a real score rather than a hand-built `MatchResult`: a mandate
   * that contradicts the asset on every criterion has to land in the band
   * this predicate drops, or the recommendation lists would surface
   * mismatches.
   */
  it('drops a mandate that contradicts the asset on every criterion', () => {
    const opposite: MandateCriteria = {
      categories: ['BANK'],
      countries: ['GB'],
      licenceTypes: ['PI'],
      businessStatuses: ['LICENSE_ONLY'],
      ticketMinCents: 10_000_000_00,
      ticketMaxCents: 20_000_000_00,
    }
    const result = scoreMatch(opposite, asset)
    expect(result.score).toBe(0)
    expect(result.band).toBe('NONE')
    expect(isRecommendableMatch(result)).toBe(false)
  })
})
