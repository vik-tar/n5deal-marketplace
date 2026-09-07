/**
 * The shared result shape for every Server Action in this app. A mutation
 * either succeeds (`{ ok: true }`) or fails with one of a closed set of
 * reasons a client can safely switch on to render an inline message — never a
 * thrown error, which Next.js would otherwise turn into an opaque digest and a
 * generic error boundary.
 *
 * `'UNEXPECTED'` is the one member no action ever returns. It is produced on
 * the client, in the `catch` around the call, for the failures that are not
 * outcomes of the mutation at all: a dropped connection, a Prisma error an
 * action deliberately rethrows, a deploy that landed mid-submit. Those used to
 * reject inside `startTransition` with nothing to catch them, which surfaces as
 * a blank error boundary over a form the user had just filled in. Routing them
 * through the same union means one rendering path for every failure a form can
 * have, and the button comes back enabled.
 *
 * **Every error namespace in `messages/*.json` carries all five keys, and some
 * of them are unreachable. That is deliberate — do not prune them.**
 *
 * Components index the catalogue with a template literal off this union
 * (`t(\`error.${result.error}\`)`), so the catalogue must be total over the
 * union rather than over the subset a particular action happens to return. A
 * missing key is a runtime next-intl failure on the one path nobody exercises;
 * an unused key is a line of JSON.
 *
 * The rule that follows: **an unreachable string must not assert a specific
 * cause.** `contact.error.ALREADY_REQUESTED`, for instance, must not say "a
 * conversation already exists" — `startConversation` returns that case as a
 * *success*, handing back the existing thread's id. The unreachable strings
 * read as neutral fallbacks. If a future action starts returning one of these
 * codes, give that namespace's string its real meaning then, with the code that
 * produces it in the same commit.
 */
export type ActionError = 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_REQUESTED' | 'INVALID' | 'UNEXPECTED'

export type ActionResult = { ok: true } | { ok: false; error: ActionError }
