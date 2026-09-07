'use server'

import { getViewer } from '@/server/session'
import { isActive } from '@/lib/authz'
import { explainMatch, explainMatchInputSchema, type ExplainMatchInput } from '@/lib/ai/explain'

/**
 * Thin `'use server'` wrapper so `match-badge.tsx` can ask for the AI sentence
 * without bundling the Anthropic SDK into the client — every AI feature in
 * this app is a one-line action over a pure `@/lib/ai/*` function, the same
 * shape as `parseSearchQueryAction` (`@/server/actions/search`) and
 * `runTeaserReview` (`@/server/actions/assets`).
 *
 * **Requires an active signed-in viewer.** A Server Action is a network
 * endpoint, not a function the trigger's render condition can protect: this
 * action's id ships in a client chunk, and an id plus a POST is all it takes
 * to invoke it with no trigger, no page and no session.
 *
 * `isActive` and not `canBrowseBuyers`, which governs the buyer *directory*
 * but not every surface this badge appears on. `MatchBadge` also renders on
 * the **buyer's own** dashboard, over their own recommendations
 * (`buyer-dashboard.tsx`), and a `BUYER` is not `canBrowseBuyers` — gating on
 * it would make the explanation under a buyer's own match silently
 * unavailable. The union of the four surfaces (`/buyers`, `/buyers/[id]` and
 * both dashboards) is exactly "an active signed-in viewer". The payload
 * carries no ids — a score and pre-computed reason codes — so what is rationed
 * here is the operator's model budget, not a disclosure.
 *
 * **The input is validated, and that is not ceremony.** Everything handed to
 * this action is `JSON.stringify`d into a prompt by `explainMatch`, so an
 * unvalidated argument is a caller writing directly into a model's context at
 * the operator's expense. `explainMatchInputSchema` (`@/lib/ai/explain`) caps
 * the reason list at the number of criteria that exist and admits only real
 * `code`/`kind` members, which is what stops one badge click's worth of
 * authorization from buying an arbitrarily large prompt. Authentication alone
 * does not bound cost: every demo account passes `isActive`.
 *
 * The refusal is `null` in both cases, never a thrown error or a redirect,
 * because `null` is already this action's contract for "no answer" —
 * `explainMatch` collapses a missing key, a refusal and a parse failure into
 * it, and `MatchBadge` renders that case correctly today. A rejected caller
 * therefore cannot tell an authorization failure from a malformed payload from
 * an unconfigured key.
 *
 * `isAiEnabled()` is not re-checked here: `explainMatch` goes through
 * `callStructured` (`@/lib/ai/client`), which returns `null` with no key
 * configured, so this wrapper has exactly one branch to expose either way.
 */
export async function explainMatchAction(input: ExplainMatchInput): Promise<string | null> {
  if (!isActive(await getViewer())) return null

  const parsed = explainMatchInputSchema.safeParse(input)
  if (!parsed.success) return null

  return explainMatch(parsed.data)
}
