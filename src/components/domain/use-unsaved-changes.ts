'use client'

import { useEffect } from 'react'
import { setUnsavedChanges } from '@/lib/unsaved-changes'

/**
 * Declares that this component holds unsaved work, and asks the browser to
 * confirm a full page unload while it does.
 *
 * Two exits, two mechanisms, because no single one covers both:
 *
 * - **Reload, tab close, typing a new URL** — `beforeunload`. The browser shows
 *   its own dialog and ignores any message we supply; modern browsers dropped
 *   custom text years ago to stop pages from lying in it. `preventDefault()` is
 *   the supported way to ask for it.
 * - **A link inside the app** — never reaches `beforeunload`, because nothing
 *   unloads. That is what the registry is for: `SiteNav` and `LocaleSwitcher`
 *   check it in `onNavigate` (`next/link`'s cancellable navigation event) and
 *   stop there.
 *
 * The listener is attached only while `isDirty`, so a clean form adds no
 * `beforeunload` at all — a page that always registers one is a page browsers
 * refuse to restore from the back-forward cache.
 *
 * **What this does not catch: the back button.** `onNavigate` fires for link
 * clicks, not for `popstate`, and the App Router exposes no supported way to
 * block a history pop. Guarding it would mean pushing a decoy entry and undoing
 * it — a trick that breaks the history stack in ways users notice more than the
 * lost edit. Recorded as the boundary of this guard, not an oversight.
 */
export function useUnsavedChanges(key: string, isDirty: boolean): void {
  useEffect(() => {
    setUnsavedChanges(key, isDirty)
    if (!isDirty) return

    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
    }
  }, [key, isDirty])

  // Leaving the page unmounts the form, and a registry entry that outlives its
  // component would block every later navigation with nothing on screen to
  // explain why.
  useEffect(() => () => setUnsavedChanges(key, false), [key])
}
