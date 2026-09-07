'use server'

import { getViewer } from '@/server/session'
import { isActive } from '@/lib/authz'
import type { AssetFilters } from '@/lib/filters/asset-filters'
import { parseSearchQuery } from '@/lib/ai/search'

/**
 * Thin `'use server'` wrapper so the smart-search client component can call
 * the AI layer without bundling the Anthropic SDK. `locale` is accepted for
 * parity with this app's other server actions (`signInAction`,
 * `signOutAction`), which all take the caller's locale as their first
 * non-payload argument; `parseSearchQuery`'s system prompt is not yet
 * locale-aware, so it is not passed through today.
 *
 * **Requires an active signed-in viewer, even though the catalog it serves
 * is public.** The catalog being public is an argument about listings, not
 * about a model endpoint: a visitor can already express every filter this
 * action produces by editing the query string, so the AI parse adds
 * convenience and no entitlement, while leaving it open would publish an
 * unauthenticated, unmetered, unbounded-input LLM call — this action's id
 * ships in the `/listings` client chunk, and `/listings` is anonymous —
 * whose bill lands on the operator. The asymmetry decides it: the most an
 * anonymous caller loses is a shortcut, and the most the operator loses has
 * no ceiling. There is no rate limiter in this prototype to make the other
 * choice survivable.
 *
 * `isActive` rather than `requireViewer`: a redirect is the wrong answer to
 * a fetch, and `null` is already this action's contract for "no parse"
 * (`parseSearchQuery` returns it with no key, on a refusal, or on a parse
 * failure), which `SmartSearch` handles by falling back to a plain `q`
 * search on the raw text. `/listings` renders the AI button only for a
 * viewer this predicate admits, so the control and the endpoint agree —
 * nothing offers a button that is guaranteed to come back `null`.
 */
export async function parseSearchQueryAction(
  query: string,
  locale: string,
): Promise<Partial<AssetFilters> | null> {
  void locale
  if (!isActive(await getViewer())) return null
  return parseSearchQuery(query)
}
