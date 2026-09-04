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

export async function reviewTeaser(
  input: TeaserReviewInput,
): Promise<TeaserReview | null> {
  return callStructured({
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
    maxTokens: 1024,
    effort: 'medium',
  })
}
