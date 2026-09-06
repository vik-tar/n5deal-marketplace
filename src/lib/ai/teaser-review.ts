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
 * Drops any leak whose excerpt is not actually present in the teaser.
 *
 * The prompt tells the model to report nothing it cannot quote, but a prompt is
 * not an enforcement mechanism. This is: the deterministic layer verifies the
 * model's claim before a seller ever sees it, so a paraphrased or invented
 * "quote" is discarded rather than presented as evidence of a leak.
 */
export function keepQuotedLeaks(
  leaks: TeaserReview['leaks'],
  teaserTitle: string,
  teaserDescription: string,
): TeaserReview['leaks'] {
  const haystack = normalise(`${teaserTitle} ${teaserDescription}`)
  return leaks.filter((leak) => {
    const needle = normalise(leak.excerpt)
    return needle.length > 0 && haystack.includes(needle)
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
