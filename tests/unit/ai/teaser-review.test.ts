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

  /**
   * A one- or two-character "excerpt" is present in almost any teaser by
   * chance, so verifying one proves nothing about what the model found. The
   * whole filter fails permissive by design — it can only ever report a leak
   * that is not there, never hide one that is — and this is the cheapest
   * place that bias turns into a false accusation.
   */
  it('drops an excerpt too short to be evidence', () => {
    const leaks = keepQuotedLeaks(
      [leak('a'), leak('an'), leak('emi')],
      'A great EMI opportunity',
      'This is a licensed EMI operating since 2015.',
    )
    expect(leaks).toEqual([])
  })

  it('keeps the shortest excerpt that is long enough', () => {
    const leaks = keepQuotedLeaks(
      [leak('Acme')],
      'A great EMI opportunity',
      'Acme holds the licence.',
    )
    expect(leaks).toEqual([leak('Acme')])
  })

  it('drops an excerpt that only appears inside a longer word', () => {
    const leaks = keepQuotedLeaks(
      [leak('bank')],
      'A payments opportunity',
      'Revenue is recognised on a bankable, semiannual basis.',
    )
    expect(leaks).toEqual([])
  })

  it('keeps an excerpt whose own ends are punctuation', () => {
    const leaks = keepQuotedLeaks(
      [leak('(Acme Holdings Ltd)')],
      'A great EMI opportunity',
      'The vendor (Acme Holdings Ltd) is selling.',
    )
    expect(leaks).toEqual([leak('(Acme Holdings Ltd)')])
  })

  /**
   * The two fields are searched separately, not joined: a "quote" spanning
   * the end of the title and the start of the description appears in neither
   * field the seller can edit, so reporting it would send them looking for
   * text that is not in either box.
   */
  it('drops a quote that straddles the title and the description', () => {
    const leaks = keepQuotedLeaks(
      [leak('opportunity This')],
      'A great EMI opportunity',
      'This is a licensed EMI operating since 2015.',
    )
    expect(leaks).toEqual([])
  })

  it('returns an empty array unchanged', () => {
    const leaks = keepQuotedLeaks([], 'A great EMI opportunity', 'Some description.')
    expect(leaks).toEqual([])
  })
})
