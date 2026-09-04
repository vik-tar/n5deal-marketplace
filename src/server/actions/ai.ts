'use server'

import { explainMatch, type ExplainMatchInput } from '@/lib/ai/explain'

/**
 * Thin `'use server'` wrapper so `match-badge.tsx` can ask for the AI
 * sentence without bundling the Anthropic SDK into the client, mirroring
 * `parseSearchQueryAction` (`@/server/actions/search`, Task 12) and
 * `runTeaserReview` (`@/server/actions/assets`, Task 15) — every AI feature
 * in this app is a one-line action over a pure `@/lib/ai/*` function.
 *
 * Deliberately does not re-check `isAiEnabled()` itself: `explainMatch`
 * (`@/lib/ai/explain`) already goes through `callStructured`
 * (`@/lib/ai/client`), which returns `null` with no key configured, so this
 * wrapper has exactly one branch to expose either way. The caller still
 * reads `isAiEnabled()` server-side to decide whether to render the trigger
 * at all (ruling 4, Task 17) — this action is only ever invoked once that
 * trigger exists.
 */
export async function explainMatchAction(input: ExplainMatchInput): Promise<string | null> {
  return explainMatch(input)
}
