import { describe, expect, it } from 'vitest'
import { assetInputSchema } from '@/lib/validation/asset'

/** A fully valid listing, used as the base for the invalid variants below. */
const validInput = {
  category: 'FINTECH',
  licenceType: 'EMI',
  businessType: 'Card issuing and processing',
  country: 'mt',
  regulator: 'MFSA',
  businessStatus: 'ACTIVE',
  askingPriceCents: 250_000_00,
  employees: 12,
  yearOfIssue: 2018,
  included: ['Licence', 'Client book', 'Core team'],
  teaserTitle: 'Licensed EMI with an active client base',
  teaserDescription:
    'A well-established e-money institution operating across the EU/EEA with a diversified client base and a strong compliance track record.',
  legalName: 'Acme Payments Ltd',
  revenueCents: 5_000_000_00,
  ebitdaCents: 1_200_000_00,
  clientCount: 340,
  dataRoomUrl: '',
  confidentialNotes: '',
} as const

describe('assetInputSchema', () => {
  it('accepts a valid listing, normalising the country code to upper case', () => {
    const result = assetInputSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    expect(result.success && result.data.country).toBe('MT')
  })

  it('rejects a teaser title shorter than 10 characters', () => {
    const result = assetInputSchema.safeParse({ ...validInput, teaserTitle: 'Too short' })
    expect(result.success).toBe(false)
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
      'teaserTitle',
    )
  })

  it('rejects a yearOfIssue in the future', () => {
    const result = assetInputSchema.safeParse({
      ...validInput,
      yearOfIssue: new Date().getFullYear() + 1,
    })
    expect(result.success).toBe(false)
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
      'yearOfIssue',
    )
  })
})
