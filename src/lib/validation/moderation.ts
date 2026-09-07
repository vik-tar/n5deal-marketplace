import { z } from 'zod'

/**
 * The mandatory reason every moderation action carries, in one place.
 *
 * Design decision D4 is that a status change without an audit trail is the
 * hole this whole feature exists to close, and a `ModerationLog` row whose
 * `reason` is `"x"` closes it only on paper — six months later nobody can
 * tell why an account was suspended. So the minimum is a real sentence
 * fragment, not a non-empty string.
 *
 * Ten characters is the floor the plan and brief fix; it is short enough that
 * a manager acting on an obvious case ("duplicate") is not fighting the form,
 * and long enough that a single keystroke or a stray space cannot satisfy it.
 * The ceiling is a payload bound in the same spirit as `MAX_BIO_LENGTH`
 * (`@/lib/validation/profile`): the column is unbounded `String`, and a
 * reason is a note, not a case file.
 *
 * `trim()` runs before both bounds, so `"          "` (ten spaces) fails
 * rather than passing on length — the check is about what was written, not
 * about how much whitespace was typed.
 *
 * Like `@/lib/validation/asset` and `@/lib/validation/profile`, this module
 * imports nothing but `zod`: it is reachable from the client component that
 * disables the confirm button (`@/components/domain/moderation-dialog`), from
 * the Server Actions that actually enforce it (`@/server/actions/moderation`),
 * and from `tests/unit/validation/moderation.test.ts` with `DATABASE_URL`
 * unset. The dialog and the action share this one definition rather than each
 * spelling out "at least ten characters", so the button cannot enable itself
 * for input the server will reject.
 */
export const MIN_MODERATION_REASON = 10
export const MAX_MODERATION_REASON = 1000

export const moderationReasonSchema = z
  .string()
  .trim()
  .min(MIN_MODERATION_REASON)
  .max(MAX_MODERATION_REASON)

/**
 * The same rule as a plain boolean, for the client. The dialog needs to know
 * whether to enable its confirm button on every keystroke, and threading a
 * `SafeParseResult` through a `disabled` prop reads worse than asking the
 * question directly.
 */
export function isValidModerationReason(reason: string): boolean {
  return moderationReasonSchema.safeParse(reason).success
}
