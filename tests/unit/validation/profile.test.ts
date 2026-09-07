import { describe, expect, it } from 'vitest'
import { buyerProfileSchema, mandateCriteriaSchema, mandateSchema } from '@/lib/validation/profile'

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

/**
 * The six comparable fields on their own, which is what `countMandateMatches`
 * (`@/server/actions/profile`) scores a *client-supplied* mandate with. That
 * action used to take a raw `MandateCriteria` off the wire and hand it
 * straight to `scoreMatch`, which indexes these four fields as arrays without
 * checking that they are arrays — so a non-array `categories` threw out of
 * the loop and reached the caller as a 500 rather than as `INVALID`.
 */
describe('mandateCriteriaSchema', () => {
  /** The six comparable fields, named rather than spread, since being exactly six is the point. */
  const validCriteria = {
    categories: validMandate.categories,
    countries: validMandate.countries,
    licenceTypes: validMandate.licenceTypes,
    businessStatuses: validMandate.businessStatuses,
    ticketMinCents: validMandate.ticketMinCents,
    ticketMaxCents: validMandate.ticketMaxCents,
  }

  it('accepts the six comparable fields, with or without the planning fields around them', () => {
    const result = mandateCriteriaSchema.safeParse(validCriteria)
    expect(result.success).toBe(true)
    expect(result.success && result.data.countries).toEqual(['MT', 'GB'])
  })

  it.each(['categories', 'countries', 'licenceTypes', 'businessStatuses'] as const)(
    'rejects a %s that is not an array',
    (field) => {
      const result = mandateCriteriaSchema.safeParse({ ...validCriteria, [field]: 'EMI' })
      expect(result.success).toBe(false)
      expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
        field,
      )
    },
  )

  it('enforces the same ticket ordering rule as the full mandate', () => {
    const result = mandateCriteriaSchema.safeParse({
      ...validCriteria,
      ticketMinCents: 9_000_000_00,
      ticketMaxCents: 1_000_000_00,
    })
    expect(result.success).toBe(false)
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path[0])).toContain(
      'ticketMaxCents',
    )
  })

  it('rejects a category outside the fixed universe, exactly as mandateSchema does', () => {
    const payload = { ...validCriteria, categories: ['NOT_A_CATEGORY'] }
    expect(mandateCriteriaSchema.safeParse(payload).success).toBe(false)
    expect(mandateSchema.safeParse({ ...validMandate, ...payload }).success).toBe(false)
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

  /**
   * The schema is what actually guarantees a buyer cannot be saved nameless —
   * the form's inline red field is a courtesy, and a Server Action is reachable
   * without any form at all. Both the truly empty string and the
   * whitespace-only one, because `requiredText` trims before it counts and a
   * field cleared with the spacebar looks identical to one cleared properly.
   */
  it('rejects a display name that is empty or only whitespace', () => {
    for (const displayName of ['', ' ', '   ', '\t\n ']) {
      const result = buyerProfileSchema.safeParse({ ...validProfile, displayName })
      expect(result.success, JSON.stringify(displayName)).toBe(false)
    }
  })

  /**
   * The profile page's "unsaved changes" marker compares the *parsed* form
   * against the last saved values, not the raw text, so that retyping `gb`
   * over `GB` or padding a name with spaces is not flagged as an edit — a
   * marker that lights up for a change the database cannot see is one people
   * learn to ignore. That comparison is only sound if parsing is idempotent
   * and order-stable, which is what these assert.
   */
  it('normalises two spellings of the same profile to the same value', () => {
    const typed = buyerProfileSchema.safeParse({
      ...validProfile,
      displayName: '  Meridian Growth Partners  ',
      country: 'gb',
    })
    const canonical = buyerProfileSchema.safeParse({
      ...validProfile,
      displayName: 'Meridian Growth Partners',
      country: 'GB',
    })
    expect(typed.success && canonical.success).toBe(true)
    if (typed.success && canonical.success) {
      expect(JSON.stringify(typed.data)).toBe(JSON.stringify(canonical.data))
    }
  })

  it('parses to a stable key order, so a serialized comparison is meaningful', () => {
    const a = buyerProfileSchema.safeParse(validProfile)
    const b = buyerProfileSchema.safeParse({
      // Same fields, declared in a different order.
      websiteUrl: validProfile.websiteUrl,
      bio: validProfile.bio,
      country: validProfile.country,
      buyerType: validProfile.buyerType,
      displayName: validProfile.displayName,
    })
    expect(a.success && b.success).toBe(true)
    if (a.success && b.success) expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data))
  })

  it('keeps a name that merely has whitespace around it, trimmed', () => {
    const result = buyerProfileSchema.safeParse({ ...validProfile, displayName: '  Acme  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.displayName).toBe('Acme')
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
