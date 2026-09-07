import { z } from 'zod'
import { MATCH_REASON_CODES, MATCH_REASON_KINDS, type MatchReason } from '@/lib/matching'
import { callStructured } from './client'

/**
 * What the explanation actually reads: a criterion and a verdict per reason,
 * and the score they add up to. Deliberately narrower than `MatchReason`,
 * which also carries `weight` and `earned` — this function never looks at
 * either, and a type that asks for fields it ignores invites a caller to
 * believe they matter. A full `MatchReason[]` is still assignable, so
 * `match-badge.tsx` passes `result.reasons` unchanged.
 */
export interface ExplainMatchInput {
  score: number
  reasons: Pick<MatchReason, 'code' | 'kind'>[]
  locale: string
}

/**
 * The validator for input that arrives over the wire.
 *
 * `explainMatchAction` (`@/server/actions/ai`) is a Server Action, which is to
 * say a public HTTP endpoint: its argument is whatever the caller posted, not
 * whatever the badge component happened to pass. Everything reaching this
 * module is then `JSON.stringify`d into a prompt, so unvalidated input here is
 * the one path in this codebase where a caller writes into a model's context
 * and bills the account for it. Two bounds close that:
 *
 * - `reasons` is capped at the number of criteria that exist. There are five
 *   scoring criteria and `scoreMatch` emits exactly one reason per criterion,
 *   so any longer array is fabricated by definition. This is what stops a
 *   hand-rolled request from turning one badge click into a six-figure prompt.
 * - `code` and `kind` are enums over the real member lists, so no free text
 *   from a caller ever reaches the prompt. The model is instructed to
 *   introduce no fact that is not in the reasons; that instruction is only
 *   worth as much as the reasons being real.
 *
 * `score` is bounded to the range `scoreMatch` can produce. Unknown keys —
 * `weight`, `earned`, anything else a caller attaches — are stripped by zod
 * rather than forwarded.
 *
 * It lives here rather than in the action because a `'use server'` module may
 * export nothing but async Server Actions, and this rule is worth a unit test
 * (`tests/unit/ai/explain.test.ts`).
 */
export const explainMatchInputSchema = z.object({
  score: z.number().min(0).max(100),
  reasons: z
    .array(
      z.object({
        code: z.enum(MATCH_REASON_CODES),
        kind: z.enum(MATCH_REASON_KINDS),
      }),
    )
    .max(MATCH_REASON_CODES.length),
  locale: z.string(),
})

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
      language: input.locale === 'es' ? 'Spanish' : 'English',
      score: input.score,
      reasons: input.reasons.map((r) => ({ criterion: r.code, kind: r.kind })),
    }),
    schema: explanationSchema,
  })
  return result?.explanation.trim() ?? null
}
