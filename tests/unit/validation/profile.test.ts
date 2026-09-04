import { describe, expect, it } from 'vitest'
import { buyerProfileSchema, mandateSchema } from '@/lib/validation/profile'

/** A fully valid mandate, used as the base for the invalid variants below. */
const validMandate = {
  categories: ['PAYMENT', 'EMI'],
  countries: ['mt', 'GB'],
  licenceTypes: ['PI', 'EMI'],
  businessStatuses: ['ACTIVE'],
  ticketMinCents: 1_000_000_00,
  ticketMaxCents: 6_000_000_00,
  timelineMonths: 6,
  notes: 'Deploying into licensed EU/UK payments and e-money infrastructure.',
} as const

/** The "any preference" mandate — every array empty, every bound null. */
const emptyMandate = {
  categories: [],
  countries: [],
  licenceTypes: [],
  businessStatuses: [],
  ticketMinCents: null,
  ticketMaxCents: null,
  timelineMonths: null,
  notes: '',
} as const

describe('mandateSchema', () => {
  it('accepts a fully specified mandate, normalising country codes to upper case', () => {
    const result = mandateSchema.safeParse(validMandate)
    expect(result.success).toBe(true)
    expect(result.success && result.data.countries).toEqual(['MT', 'GB'])
  })

  it('accepts the empty "any preference" mandate', () => {
    const result = mandateSchema.safeParse(emptyMandate)
    expect(result.success).toBe(true)
  })

  it('rejects ticketMinCents greater than ticketMaxCents', () => {
    const result = mandateSchema.safeParse({
      ...validMandate,
      ticketMinCents: 6_000_000_00,
      ticketMaxCents: 1_000_000_00,
    })
    expect(result.success).toBe(false)
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
      'ticketMaxCents',
    )
  })

  it('accepts ticketMinCents equal to ticketMaxCents', () => {
    const result = mandateSchema.safeParse({
      ...validMandate,
      ticketMinCents: 1_000_000_00,
      ticketMaxCents: 1_000_000_00,
    })
    expect(result.success).toBe(true)
  })

  it('accepts an unbounded ticket band (either or both ends null)', () => {
    expect(
      mandateSchema.safeParse({ ...validMandate, ticketMinCents: null }).success,
    ).toBe(true)
    expect(
      mandateSchema.safeParse({ ...validMandate, ticketMaxCents: null }).success,
    ).toBe(true)
    expect(
      mandateSchema.safeParse({ ...validMandate, ticketMinCents: null, ticketMaxCents: null })
        .success,
    ).toBe(true)
  })

  it('rejects a malformed country code', () => {
    const result = mandateSchema.safeParse({ ...validMandate, countries: ['MLT'] })
    expect(result.success).toBe(false)
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
      'countries',
    )
  })

  it('rejects a country code with digits', () => {
    const result = mandateSchema.safeParse({ ...validMandate, countries: ['M1'] })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown category', () => {
    const result = mandateSchema.safeParse({ ...validMandate, categories: ['WOMBAT'] })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown licence type', () => {
    const result = mandateSchema.safeParse({ ...validMandate, licenceTypes: ['FCA-AP'] })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown business status', () => {
    const result = mandateSchema.safeParse({ ...validMandate, businessStatuses: ['DORMANT'] })
    expect(result.success).toBe(false)
  })

  it('rejects a timelineMonths outside 1-60', () => {
    expect(mandateSchema.safeParse({ ...validMandate, timelineMonths: 0 }).success).toBe(false)
    expect(mandateSchema.safeParse({ ...validMandate, timelineMonths: 61 }).success).toBe(false)
  })

  it('accepts a null timelineMonths', () => {
    expect(mandateSchema.safeParse({ ...validMandate, timelineMonths: null }).success).toBe(true)
  })

  it('rejects notes over 1000 characters', () => {
    const result = mandateSchema.safeParse({ ...validMandate, notes: 'x'.repeat(1001) })
    expect(result.success).toBe(false)
  })

  it('rejects a negative ticket bound', () => {
    const result = mandateSchema.safeParse({ ...validMandate, ticketMinCents: -1 })
    expect(result.success).toBe(false)
  })
})

describe('buyerProfileSchema', () => {
  const validProfile = {
    displayName: 'Meridian Growth Partners',
    buyerType: 'PE_FUND',
    country: 'gb',
    bio: 'Lower-mid-market PE fund acquiring licensed European payments infrastructure.',
    websiteUrl: '',
  } as const

  it('accepts a valid profile, normalising the country code and dropping a blank website', () => {
    const result = buyerProfileSchema.safeParse(validProfile)
    expect(result.success).toBe(true)
    expect(result.success && result.data.country).toBe('GB')
    expect(result.success && result.data.websiteUrl).toBeUndefined()
  })

  it('accepts a real website URL', () => {
    const result = buyerProfileSchema.safeParse({
      ...validProfile,
      websiteUrl: 'https://meridian.example',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a malformed website URL', () => {
    const result = buyerProfileSchema.safeParse({ ...validProfile, websiteUrl: 'not-a-url' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty display name', () => {
    const result = buyerProfileSchema.safeParse({ ...validProfile, displayName: '   ' })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown buyer type', () => {
    const result = buyerProfileSchema.safeParse({ ...validProfile, buyerType: 'HEDGE_FUND' })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed country code', () => {
    const result = buyerProfileSchema.safeParse({ ...validProfile, country: 'GBR' })
    expect(result.success).toBe(false)
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
      'country',
    )
  })
})
