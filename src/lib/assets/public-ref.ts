// This module is pure — no database import — so `nextPublicRef` below can be
// unit-tested on its own and so `@/server/actions/assets` (a `'use server'`
// module, where every top-level export must be an async Server Action) can use
// it as a plain helper without exporting it itself.

/** The prefix every listing's human-readable reference carries. Module-local: only `nextPublicRef` reads it. */
const PUBLIC_REF_PREFIX = 'N5-'

/**
 * The next free `publicRef`, given every ref already in play.
 *
 * Sorting `publicRef` as a *string* (`ORDER BY "publicRef" DESC`) is not
 * numerically safe once the numeric part crosses a digit-length boundary —
 * `"N5-9"` sorts after `"N5-10"` — so the maximum is computed here, in JS,
 * from the numeric suffix of every ref, not read off the database's own
 * ordering.
 */
export function nextPublicRef(existingRefs: readonly string[]): string {
  let max = 0
  for (const ref of existingRefs) {
    if (!ref.startsWith(PUBLIC_REF_PREFIX)) continue
    const n = Number(ref.slice(PUBLIC_REF_PREFIX.length))
    if (Number.isInteger(n) && n > max) max = n
  }
  return `${PUBLIC_REF_PREFIX}${max + 1}`
}
