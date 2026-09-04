'use server'

import type { AssetFilters } from '@/lib/filters/asset-filters'
import { parseSearchQuery } from '@/lib/ai/search'

/**
 * Thin `'use server'` wrapper so the smart-search client component can call
 * the AI layer without bundling the Anthropic SDK. `locale` is accepted for
 * parity with this app's other server actions (`signInAction`,
 * `signOutAction`), which all take the caller's locale as their first
 * non-payload argument; `parseSearchQuery`'s system prompt is not yet
 * locale-aware, so it is not passed through today.
 */
export async function parseSearchQueryAction(
  query: string,
  locale: string,
): Promise<Partial<AssetFilters> | null> {
  void locale
  return parseSearchQuery(query)
}
