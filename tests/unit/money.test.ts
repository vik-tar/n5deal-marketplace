import { describe, expect, it } from 'vitest'
import { formatCents, parseEuros } from '@/lib/money'

describe('formatCents', () => {
  it('renders euro cents as a grouped euro amount', () => {
    expect(formatCents(250_000_00, 'en')).toBe('€250,000')
  })

  it('renders millions compactly', () => {
    expect(formatCents(2_400_000_00, 'en')).toBe('€2.4M')
  })

  it('localises grouping', () => {
    // Intl.NumberFormat('ru', ...) groups with U+00A0 (non-breaking space),
    // not a regular space, and places the currency symbol after the number.
    expect(formatCents(250_000_00, 'ru')).toBe('250 000 €')
  })
})

describe('parseEuros', () => {
  it('accepts plain digits', () => {
    expect(parseEuros('250000')).toBe(25_000_000)
  })

  it('accepts one or two decimal places', () => {
    expect(parseEuros('1234.56')).toBe(123_456)
    expect(parseEuros('0.5')).toBe(50)
  })

  it('tolerates a regular space as a grouping separator', () => {
    expect(parseEuros('250 000')).toBe(25_000_000)
  })

  it('tolerates a non-breaking space (U+00A0) as a grouping separator', () => {
    expect(parseEuros('250\u00A0000')).toBe(25_000_000)
  })

  it('tolerates a comma as a grouping separator', () => {
    expect(parseEuros('250,000')).toBe(25_000_000)
  })

  it('tolerates a comma grouping separator combined with a decimal point', () => {
    expect(parseEuros('1,234.56')).toBe(123_456)
  })

  it('rejects a dot used as a thousands-grouping separator (ambiguous with a decimal point)', () => {
    // "1.234,56" reads as "1 euro 23 cents" under the decimal-point grammar
    // this function accepts elsewhere, so it is rejected rather than guessed.
    expect(parseEuros('1.234,56')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(parseEuros('')).toBeNull()
  })

  it('rejects non-numeric input', () => {
    expect(parseEuros('abc')).toBeNull()
  })

  it('rejects a negative amount', () => {
    expect(parseEuros('-5')).toBeNull()
  })

  it('rejects more than two decimal places', () => {
    expect(parseEuros('12.345')).toBeNull()
  })

  it('rejects exponential notation', () => {
    expect(parseEuros('1e6')).toBeNull()
  })
})
