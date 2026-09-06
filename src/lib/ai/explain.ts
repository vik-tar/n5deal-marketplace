import { z } from 'zod'
import type { MatchReason } from '@/lib/matching'
import { callStructured } from './client'

export interface ExplainMatchInput {
  score: number
  reasons: MatchReason[]
  locale: string
}

const explanationSchema = z.object({ explanation: z.string() })

const SYSTEM = `You restate pre-computed match reasons in one or two short sentences.

You receive a score and a list of reasons. Each reason has a criterion code and a
kind: MATCH, PARTIAL, MISMATCH or NO_PREFERENCE. Explain what fits and what does
not, in that order.

You must not introduce any fact that is not in the reasons. Do not name a
country, a price or a licence type unless it appears in the input.
Write in the requested language.`

export async function explainMatch(input: ExplainMatchInput): Promise<string | null> {
  const result = await callStructured({
    system: SYSTEM,
    user: JSON.stringify({
      language: input.locale === 'ru' ? 'Russian' : 'English',
      score: input.score,
      reasons: input.reasons.map((r) => ({ criterion: r.code, kind: r.kind })),
    }),
    schema: explanationSchema,
  })
  return result?.explanation.trim() ?? null
}
