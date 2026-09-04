import { describe, expect, it } from 'vitest'
import { codeToFlag } from '@/lib/geo/flag'

describe('codeToFlag', () => {
  it('builds the expected flag for a known code', () => {
    expect(codeToFlag('MT')).toBe('🇲🇹')
  })

  it('is case-insensitive', () => {
    expect(codeToFlag('mt')).toBe('🇲🇹')
    expect(codeToFlag('Mt')).toBe('🇲🇹')
  })

  it('returns the empty string for a malformed code', () => {
    expect(codeToFlag('M1')).toBe('')
    expect(codeToFlag('12')).toBe('')
    expect(codeToFlag('m')).toBe('')
  })

  it('returns the empty string for an empty input', () => {
    expect(codeToFlag('')).toBe('')
  })

  it('returns the empty string for a three-letter code', () => {
    expect(codeToFlag('MLT')).toBe('')
  })
})
