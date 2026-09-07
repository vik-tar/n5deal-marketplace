import { describe, expect, it } from 'vitest'
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  SELF_SERVICE_ROLES,
  registrationSchema,
} from '@/lib/validation/registration'

const buyer = {
  role: 'BUYER' as const,
  email: 'new.buyer@example.com',
  password: 'correct horse battery',
  country: 'GB',
  displayName: 'Northwind Capital',
  buyerType: 'PE_FUND' as const,
}

const seller = {
  role: 'SELLER' as const,
  email: 'new.seller@example.com',
  password: 'correct horse battery',
  country: 'MT',
  companyName: 'Apex Advisory',
  contactName: 'A. Advisor',
}

describe('registrationSchema — who may register', () => {
  /**
   * The single most important assertion in this file. On a public demo, a
   * sign-up that accepted a role parameter would let any visitor make
   * themselves a moderator — and the manager console is the only surface that
   * writes `UserStatus`, so a self-appointed manager who suspends everyone is
   * not a recoverable mistake. The protection is the shape of the union, not a
   * check somewhere that could be edited out; this holds the shape.
   */
  it('refuses MANAGER, however the payload is dressed up', () => {
    const attempts = [
      { ...buyer, role: 'MANAGER' },
      { ...seller, role: 'MANAGER' },
      { ...buyer, role: 'manager' },
      { ...buyer, role: ['BUYER', 'MANAGER'] },
      { ...buyer, role: { toString: () => 'MANAGER' } },
    ]
    for (const attempt of attempts) {
      expect(registrationSchema.safeParse(attempt).success, JSON.stringify(attempt.role)).toBe(false)
    }
  })

  it('offers exactly the two self-service roles', () => {
    expect([...SELF_SERVICE_ROLES]).toEqual(['BUYER', 'SELLER'])
  })

  it('accepts a well-formed buyer and a well-formed seller', () => {
    expect(registrationSchema.safeParse(buyer).success).toBe(true)
    expect(registrationSchema.safeParse(seller).success).toBe(true)
  })

  /**
   * The union is what keeps a role and its profile from disagreeing: a buyer
   * payload carrying a seller's fields does not quietly drop them, it fails.
   */
  it('refuses a role carrying the other role’s profile fields', () => {
    const { displayName, buyerType, ...buyerBase } = buyer
    void displayName
    void buyerType
    expect(
      registrationSchema.safeParse({ ...buyerBase, companyName: 'X', contactName: 'Y' }).success,
    ).toBe(false)

    const { companyName, contactName, ...sellerBase } = seller
    void companyName
    void contactName
    expect(
      registrationSchema.safeParse({ ...sellerBase, displayName: 'X', buyerType: 'PE_FUND' }).success,
    ).toBe(false)
  })
})

describe('registrationSchema — credentials', () => {
  it('lower-cases and trims the email, matching how sign-in looks it up', () => {
    const result = registrationSchema.safeParse({ ...buyer, email: '  New.Buyer@Example.COM  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe('new.buyer@example.com')
  })

  it('refuses an address that is not one', () => {
    for (const email of ['', 'not-an-email', 'a@', '@b.com', 'a b@c.com']) {
      expect(registrationSchema.safeParse({ ...buyer, email }).success, email).toBe(false)
    }
  })

  it('refuses a password shorter than the minimum', () => {
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1)
    expect(registrationSchema.safeParse({ ...buyer, password: short }).success).toBe(false)
    expect(
      registrationSchema.safeParse({ ...buyer, password: 'x'.repeat(MIN_PASSWORD_LENGTH) }).success,
    ).toBe(true)
  })

  /**
   * bcrypt ignores everything past its 72nd **byte**, silently — so a longer
   * passphrase would be half-discarded and two different passwords sharing a
   * prefix would both open the account. Refusing is the honest answer, and the
   * limit has to be counted in bytes: 72 accented Spanish characters are 144
   * of them, and a character-based check would pass exactly the input that
   * gets cut.
   */
  it('refuses a password past bcrypt’s silent truncation point, counted in bytes', () => {
    expect(
      registrationSchema.safeParse({ ...buyer, password: 'a'.repeat(MAX_PASSWORD_BYTES) }).success,
    ).toBe(true)
    expect(
      registrationSchema.safeParse({ ...buyer, password: 'a'.repeat(MAX_PASSWORD_BYTES + 1) }).success,
    ).toBe(false)

    const accented = 'á'.repeat(MAX_PASSWORD_BYTES / 2)
    expect(new TextEncoder().encode(accented).length).toBe(MAX_PASSWORD_BYTES)
    expect(registrationSchema.safeParse({ ...buyer, password: accented }).success).toBe(true)
    expect(
      registrationSchema.safeParse({ ...buyer, password: accented + 'á' }).success,
      'one more accented character is two more bytes',
    ).toBe(false)
  })

  it('requires a real country code and normalises its case', () => {
    expect(registrationSchema.safeParse({ ...buyer, country: 'GBR' }).success).toBe(false)
    expect(registrationSchema.safeParse({ ...buyer, country: '' }).success).toBe(false)
    const result = registrationSchema.safeParse({ ...buyer, country: 'gb' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.country).toBe('GB')
  })

  it('refuses a blank or whitespace-only name', () => {
    for (const displayName of ['', '   ']) {
      expect(registrationSchema.safeParse({ ...buyer, displayName }).success).toBe(false)
    }
    for (const companyName of ['', '   ']) {
      expect(registrationSchema.safeParse({ ...seller, companyName }).success).toBe(false)
    }
  })
})
