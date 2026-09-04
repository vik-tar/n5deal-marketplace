import { describe, expect, it } from 'vitest'
import { keepQuotedLeaks } from '@/lib/ai/teaser-review'
import type { TeaserReview } from '@/lib/ai/teaser-review'

function leak(excerpt: string): TeaserReview['leaks'][number] {
  return { field: 'other', excerpt, explanation: 'because' }
}

describe('keepQuotedLeaks', () => {
  it('keeps a leak whose excerpt appears verbatim in the description', () => {
    const leaks = keepQuotedLeaks(
      [leak('a licensed EMI operating since 2015')],
      'A great EMI opportunity',
      'This is a licensed EMI operating since 2015 with a strong client base.',
    )
    expect(leaks).toEqual([leak('a licensed EMI operating since 2015')])
  })

  it('keeps one that differs only by letter case', () => {
    const leaks = keepQuotedLeaks(
      [leak('LICENSED EMI')],
      'A great EMI opportunity',
      'This is a licensed emi operating since 2015.',
    )
    expect(leaks).toEqual([leak('LICENSED EMI')])
  })

  it('keeps one that differs only by collapsed whitespace or a line break', () => {
    const leaks = keepQuotedLeaks(
      [leak('licensed EMI operating since 2015')],
      'A great EMI opportunity',
      'This is a licensed EMI\noperating   since 2015.',
    )
    expect(leaks).toEqual([leak('licensed EMI operating since 2015')])
  })

  it('drops an excerpt that appears nowhere in either field', () => {
    const leaks = keepQuotedLeaks(
      [leak('a fact the model invented')],
      'A great EMI opportunity',
      'This is a licensed EMI operating since 2015.',
    )
    expect(leaks).toEqual([])
  })

  it('drops an empty or whitespace-only excerpt', () => {
    const leaks = keepQuotedLeaks(
      [leak(''), leak('   ')],
      'A great EMI opportunity',
      'This is a licensed EMI operating since 2015.',
    )
    expect(leaks).toEqual([])
  })

  it('matches against the title as well as the description', () => {
    const leaks = keepQuotedLeaks(
      [leak('great EMI opportunity')],
      'A great EMI opportunity',
      'No matching text here.',
    )
    expect(leaks).toEqual([leak('great EMI opportunity')])
  })

  it('returns an empty array unchanged', () => {
    const leaks = keepQuotedLeaks([], 'A great EMI opportunity', 'Some description.')
    expect(leaks).toEqual([])
  })
})
