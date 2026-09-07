import { z } from 'zod'
import { callStructured } from './client'

export interface TeaserReviewInput {
  teaserTitle: string
  teaserDescription: string
  legalName: string
  revenueCents: number
  ebitdaCents: number
  clientCount: number
}

const reviewSchema = z.object({
  leaks: z.array(
    z.object({
      field: z.enum(['legalName', 'revenue', 'ebitda', 'clientCount', 'other']),
      excerpt: z.string(),
      explanation: z.string(),
    }),
  ),
  suggestions: z.array(z.string()),
})

export type TeaserReview = z.infer<typeof reviewSchema>

const SYSTEM = `You review the public teaser of a confidential M&A listing.

The teaser is shown to every visitor. The confidential values are released only
after the seller approves a buyer under an NDA. Your job is to find places where
the teaser reveals confidential information, directly or by obvious inference —
the legal entity name, an exact revenue or EBITDA figure, an exact client count,
or a detail so specific that the company could be identified from it.

Quote the offending text in "excerpt" exactly as it appears. Report nothing you
cannot quote. Then give at most three short suggestions for making the teaser
more useful to a buyer without revealing more.`

/** Collapses whitespace and case so a quote survives cosmetic reformatting. */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * The shortest excerpt that can stand as evidence on its own.
 *
 * Below four characters an excerpt is a fragment, not a quotation: "a", "of"
 * or "42" occur in almost any teaser by chance, so a substring test on one
 * proves nothing about what the model actually found. The model is told to
 * quote the offending text, and no real leak — a legal name, a figure, an
 * identifying detail — is three characters long.
 */
const MIN_EXCERPT_LENGTH = 4

/** Letters and digits in any script: the teaser may be English or Spanish. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u

/**
 * Whether `haystack` contains `needle` as a quotation rather than as the
 * middle of a longer word — "EMI" must not be verified against "semiannual".
 *
 * The boundary is only required on an end that is itself alphanumeric, so an
 * excerpt that legitimately opens or closes on punctuation ("€4.2m," or
 * "(Acme Ltd)") still matches. Both strings arrive normalised, so this
 * compares collapsed, lower-cased text.
 */
function quotedAtWordBoundary(haystack: string, needle: string): boolean {
  const opensOnWord = WORD_CHARACTER.test(needle.slice(0, 1))
  const closesOnWord = WORD_CHARACTER.test(needle.slice(-1))
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    const before = haystack.slice(at - 1, at)
    const after = haystack.slice(at + needle.length, at + needle.length + 1)
    const startsClean = !opensOnWord || at === 0 || !WORD_CHARACTER.test(before)
    const endsClean = !closesOnWord || after === '' || !WORD_CHARACTER.test(after)
    if (startsClean && endsClean) return true
  }
  return false
}

/**
 * Drops any leak whose excerpt is not actually quoted in the teaser.
 *
 * The prompt tells the model to report nothing it cannot quote, but a prompt is
 * not an enforcement mechanism. This is: the deterministic layer verifies the
 * model's claim before a seller ever sees it, so a paraphrased or invented
 * "quote" is discarded rather than presented as evidence of a leak.
 *
 * "Quoted" is three conditions, not one. A bare `includes` on a single
 * concatenated string — what this did until the branch review's third fix
 * round — verified a one-character excerpt, verified "EMI" against
 * "semiannual", and verified a "quote" that straddled the join between the
 * title and the description and so appears in neither field the seller can
 * edit. All three fail in the same direction: a leak reported that is not
 * there. That is the safe direction for a review panel and still the wrong
 * answer, because a false leak report is what teaches a seller to stop reading
 * them.
 *
 * The title and the description are therefore searched separately rather than
 * joined, which removes the straddle without a separator convention to get
 * wrong, and `field` on the surviving leak keeps pointing at whichever
 * confidential value the model matched — the two are unrelated.
 */
export function keepQuotedLeaks(
  leaks: TeaserReview['leaks'],
  teaserTitle: string,
  teaserDescription: string,
): TeaserReview['leaks'] {
  const fields = [normalise(teaserTitle), normalise(teaserDescription)]
  return leaks.filter((leak) => {
    const needle = normalise(leak.excerpt)
    if (needle.length < MIN_EXCERPT_LENGTH) return false
    return fields.some((field) => quotedAtWordBoundary(field, needle))
  })
}

export async function reviewTeaser(
  input: TeaserReviewInput,
): Promise<TeaserReview | null> {
  const result = await callStructured({
    system: SYSTEM,
    user: JSON.stringify({
      teaser: { title: input.teaserTitle, description: input.teaserDescription },
      confidential: {
        legalName: input.legalName,
        revenueEur: Math.round(input.revenueCents / 100),
        ebitdaEur: Math.round(input.ebitdaCents / 100),
        clientCount: input.clientCount,
      },
    }),
    schema: reviewSchema,
    // A leak report can list several excerpts and up to three suggestions,
    // so it needs more room than the shared default before thinking is even
    // accounted for.
    maxTokens: 8192,
    effort: 'medium',
  })

  if (result === null) return null

  return {
    leaks: keepQuotedLeaks(result.leaks, input.teaserTitle, input.teaserDescription),
    suggestions: result.suggestions,
  }
}
