/**
 * A registry of "there is unsaved work on this screen", readable by components
 * that cannot see the form holding it.
 *
 * The problem it solves is a layering one. `MandateForm` knows its two sections
 * are dirty; the links that would throw that work away live in `SiteNav` and
 * `LocaleSwitcher`, which sit in the locale layout and know nothing about any
 * page below them. React context would work, but the provider would have to be
 * a client component wrapping the whole layout to serve one page's forms —
 * plumbing out of all proportion to a boolean.
 *
 * A module-level `Set` instead. Nothing here re-renders: the only reader is a
 * click handler, which asks at the moment of the click and needs no
 * subscription. That is also why this is not `useSyncExternalStore` — there is
 * no rendered output to keep in sync.
 *
 * Keyed rather than a counter, so a component that registers twice (React's
 * development double-invocation of effects does exactly that) cannot leave the
 * app permanently believing there is unsaved work. Unregistering is idempotent
 * for the same reason.
 *
 * Client-only by construction. It is never imported by a Server Component, and
 * on the server a module-level `Set` would be shared between requests — which
 * is precisely why it holds nothing but opaque keys and never any user data.
 */
const dirtyKeys = new Set<string>()

/** Records, or clears, unsaved work under `key`. */
export function setUnsavedChanges(key: string, isDirty: boolean): void {
  if (isDirty) dirtyKeys.add(key)
  else dirtyKeys.delete(key)
}

/** Whether anything on the current screen has unsaved work. */
export function hasUnsavedChanges(): boolean {
  return dirtyKeys.size > 0
}

/** Test seam: the registry outlives any one component, so a suite must reset it. */
export function clearUnsavedChanges(): void {
  dirtyKeys.clear()
}
