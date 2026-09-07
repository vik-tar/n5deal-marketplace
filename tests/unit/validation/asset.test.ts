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

  /**
   * `dataRoomUrl` is seller-written and rendered as an `<a href>` to approved
   * buyers and managers (`gated-section.tsx`). `z.url()` on its own accepts
   * both of these — verified against the installed zod 4.5.4 — so without the
   * scheme check the only thing standing between a seller and a
   * `javascript:` href in someone else's browser is React's own refusal to
   * emit one.
   */
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)'])(
    'rejects %s as a data room link',
    (dataRoomUrl) => {
      const result = assetInputSchema.safeParse({ ...validInput, dataRoomUrl })
      expect(result.success).toBe(false)
      expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
        'dataRoomUrl',
      )
    },
  )

  it.each(['https://dataroom.example.com/n5-701', 'http://dataroom.example.com/n5-701'])(
    'accepts %s as a data room link',
    (dataRoomUrl) => {
      expect(assetInputSchema.safeParse({ ...validInput, dataRoomUrl }).success).toBe(true)
    },
  )

  it('still treats a blank data room link as "no data room yet"', () => {
    const result = assetInputSchema.safeParse({ ...validInput, dataRoomUrl: '   ' })
    expect(result.success).toBe(true)
    expect(result.success && result.data.dataRoomUrl).toBeUndefined()
  })
})
