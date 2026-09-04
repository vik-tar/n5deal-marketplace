import { describe, expect, it } from 'vitest'
import { toCents, toPositiveInt } from '@/lib/filters/shared'

describe('toPositiveInt', () => {
  it("'3' returns 3", () => {
    expect(toPositiveInt('3', 1)).toBe(3)
  })

  it("'0' and '-1' return the fallback", () => {
    expect(toPositiveInt('0', 1)).toBe(1)
    expect(toPositiveInt('-1', 1)).toBe(1)
  })

  it('String(MAX_PAGE) is accepted and returns MAX_PAGE', () => {
    // MAX_PAGE should be 10_000
    expect(toPositiveInt('10000', 1)).toBe(10_000)
  })

  it('String(MAX_PAGE + 1) returns the fallback', () => {
    // MAX_PAGE + 1 should be 10_001
    expect(toPositiveInt('10001', 1)).toBe(1)
  })

  it("'100000000000000000000' returns the fallback — regression case", () => {
    // This is the regression case that must fail before the fix
    expect(toPositiveInt('100000000000000000000', 1)).toBe(1)
  })

  it("'2.5' and 'abc' return the fallback", () => {
    expect(toPositiveInt('2.5', 1)).toBe(1)
    expect(toPositiveInt('abc', 1)).toBe(1)
  })
})

describe('toCents', () => {
  it("'250000' returns 25_000_000", () => {
    expect(toCents('250000')).toBe(25_000_000)
  })

  it("'0.1' returns 10", () => {
    expect(toCents('0.1')).toBe(10)
  })

  it("'' and undefined return null", () => {
    expect(toCents('')).toBe(null)
    expect(toCents(undefined)).toBe(null)
  })

  it("'-5' returns null", () => {
    expect(toCents('-5')).toBe(null)
  })

  it('String(MAX_FILTER_CENTS / 100) is accepted and returns MAX_FILTER_CENTS', () => {
    // MAX_FILTER_CENTS should be 1_000_000_000_000
    // MAX_FILTER_CENTS / 100 = 10_000_000_000 euros
    expect(toCents('10000000000')).toBe(1_000_000_000_000)
  })

  it('String(MAX_FILTER_CENTS / 100 + 1) returns null', () => {
    // MAX_FILTER_CENTS / 100 + 1 = 10_000_000_001 euros
    expect(toCents('10000000001')).toBe(null)
  })

  it("'1e21' returns null — regression case", () => {
    // This is the regression case that must fail before the fix
    expect(toCents('1e21')).toBe(null)
  })

  it('every returned value passes Number.isSafeInteger', () => {
    const testCases = ['250000', '0.1', '100', '10000000000']
    testCases.forEach((input) => {
      const result = toCents(input)
      if (result !== null) {
        expect(Number.isSafeInteger(result)).toBe(true)
      }
    })
  })
})
