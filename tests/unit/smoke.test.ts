import { describe, expect, it } from 'vitest'
import { formatCents } from '@/lib/money'

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
    expect(formatCents(250_000_00, 'ru')).toBe('250\u00A0000\u00A0€')
  })
})
