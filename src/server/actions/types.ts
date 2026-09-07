/**
 * The shared result shape for every Server Action in Tasks 14-20. A mutation
 * either succeeds (`{ ok: true }`) or fails with one of a closed set of
 * reasons a client can safely switch on to render an inline message —
 * never a thrown error, which Next.js would otherwise turn into an opaque
 * digest and a generic error boundary.
 *
 * **Every error namespace in `messages/*.json` carries all four keys, and most
 * of them are unreachable. That is deliberate — do not prune them.**
 *
 * Components index the catalogue with a template literal off this union
 * (`t(\`error.${result.error}\`)`), so the catalogue must be total over the
 * union rather than over the subset a particular action happens to return. A
 * missing key is a runtime next-intl failure on the one path nobody exercises;
 * an unused key is a line of JSON. Eight of the twenty-eight are currently
 * unreachable: `ALREADY_REQUESTED` is returned by exactly one action
 * (`requestAccess`, `@/server/actions/access-requests`), so the six other
 * namespaces cannot produce it, and `contact.error.INVALID` and
 * `profile.error.NOT_FOUND` have no path either.
 *
 * The rule that follows: **an unreachable string must not assert a specific
 * cause.** Four of them did, and were corrected in the whole-branch review —
 * `contact.error.ALREADY_REQUESTED` said "A conversation with this account
 * already exists", which is a case `startConversation` deliberately returns as
 * a *success* (it hands back the existing thread's id), and the composer,
 * request-queue and admin copies each named a duplicate-submission refusal
 * that no code path performs. They now read as the neutral fallback the
 * listing and profile namespaces already used. If a future action does start
 * returning one of these codes, give that namespace's string its real meaning
 * then — with the code that produces it in the same commit.
 */
export type ActionError = 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_REQUESTED' | 'INVALID'

export type ActionResult = { ok: true } | { ok: false; error: ActionError }
