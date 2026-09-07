'use server'

import { getViewer } from '@/server/session'
import { isActive } from '@/lib/authz'
import { explainMatch, type ExplainMatchInput } from '@/lib/ai/explain'

/**
 * Thin `'use server'` wrapper so `match-badge.tsx` can ask for the AI
 * sentence without bundling the Anthropic SDK into the client, mirroring
 * `parseSearchQueryAction` (`@/server/actions/search`, Task 12) and
 * `runTeaserReview` (`@/server/actions/assets`, Task 15) — every AI feature
 * in this app is a one-line action over a pure `@/lib/ai/*` function.
 *
 * **Requires an active signed-in viewer.** An earlier version of this
 * comment argued it needed no check of its own because "the caller still
 * reads `isAiEnabled()` server-side to decide whether to render the trigger
 * at all … this action is only ever invoked once that trigger exists". That
 * is client-side reasoning about a network endpoint: `/buyers` is a public
 * enough route that this action's id ships in a client chunk, and an id plus
 * a POST is all it takes to invoke it with no trigger, no page and no
 * session. It is inert today only because `ANTHROPIC_API_KEY` is unset by
 * the user's standing decision; with a key it would be an anonymous LLM
 * proxy billed to the operator, at whatever rate the caller cared to send.
 *
 * `isActive` and not `canBrowseBuyers`, which governs the buyer *directory*
 * but not every surface this badge appears on. `MatchBadge` also renders on
 * the **buyer's own** dashboard, over their own recommendations
 * (`buyer-dashboard.tsx`), and a `BUYER` is not `canBrowseBuyers` — gating
 * on it would have made the explanation under a buyer's own match silently
 * unavailable the day a key is configured, which is this defect class
 * inverted rather than fixed. The union of the four surfaces (`/buyers`,
 * `/buyers/[id]`, and both dashboards) is exactly "an active signed-in
 * viewer": each of them already requires at least that, and none of them
 * requires the same thing beyond it. The payload carries no ids either — a
 * score and pre-computed reason codes — so what is being rationed here is
 * the operator's model budget, not a disclosure.
 *
 * The refusal is `null`, not a thrown error or a redirect, because `null` is
 * already this action's contract for "no answer" (`explainMatch` collapses a
 * missing key, a refusal and a parse failure into it) and `MatchBadge`
 * renders that case correctly today. It also declines to tell an
 * unauthorized caller whether a key is configured.
 *
 * `isAiEnabled()` is still not re-checked here: `explainMatch`
 * (`@/lib/ai/explain`) goes through `callStructured` (`@/lib/ai/client`),
 * which returns `null` with no key configured, so this wrapper has exactly
 * one branch to expose either way.
 */
export async function explainMatchAction(input: ExplainMatchInput): Promise<string | null> {
  if (!isActive(await getViewer())) return null
  return explainMatch(input)
}
