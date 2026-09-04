/**
 * The shared result shape for every Server Action in Tasks 14-20. A mutation
 * either succeeds (`{ ok: true }`) or fails with one of a closed set of
 * reasons a client can safely switch on to render an inline message —
 * never a thrown error, which Next.js would otherwise turn into an opaque
 * digest and a generic error boundary.
 */
export type ActionError = 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_REQUESTED' | 'INVALID'

export type ActionResult = { ok: true } | { ok: false; error: ActionError }
