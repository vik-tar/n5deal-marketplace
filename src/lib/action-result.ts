import type { ActionError } from '@/server/actions/types'

/**
 * Runs a Server Action from a Client Component and turns a *rejection* into an
 * ordinary `{ ok: false, error: 'UNEXPECTED' }` result.
 *
 * Every action in this app models its expected failures as return values —
 * that is what `ActionResult` (`@/server/actions/types`) is for — so the only
 * things that reach this `catch` are the ones no action chose: a dropped
 * connection, a Prisma error an action deliberately rethrows, a deploy that
 * landed between the click and the response. Before this existed those
 * rejected inside `startTransition` with nothing to catch them, and React took
 * the rejection to the nearest error boundary: a half-filled listing form
 * replaced by an error screen because one round trip failed.
 *
 * One helper rather than a `try`/`catch` at each of the seven call sites, so
 * every form fails the same way and the button always comes back enabled.
 *
 * It is deliberately not a `try`/`catch` *inside* the actions: an action that
 * caught its own unexpected errors would have to decide what they mean, and
 * "the write may or may not have happened" is not a state the server can
 * report honestly. Here it is honest — the client knows only that the call did
 * not complete, and says exactly that.
 *
 * A `redirect()` from `requireViewer` is not caught here. It is thrown on the
 * server, travels back as a redirect the router performs, and never surfaces
 * as a rejected promise on this side.
 *
 * `label` is what the console line is tagged with; it never reaches the user,
 * who sees the namespace's own `error.UNEXPECTED` string.
 */
export async function attempt<T>(
  label: string,
  call: Promise<T>,
): Promise<T | { ok: false; error: ActionError }> {
  try {
    return await call
  } catch (error) {
    console.error(`[action:${label}]`, error)
    return { ok: false, error: 'UNEXPECTED' }
  }
}
