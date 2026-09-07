import { z } from 'zod'

/**
 * The zod pieces `@/lib/validation/asset` and `@/lib/validation/profile` both
 * need, held once.
 *
 * All three of these existed twice — `requiredText`, `countryCode` and the
 * blank-means-absent URL preprocessor — each copy carrying a comment
 * acknowledging that it was a copy, which is a duplication documenting itself
 * rather than being fixed. They stopped being harmless the moment one copy was
 * hardened and the other was not: the listing side's URL rule gained a
 * protocol check (below) while `websiteUrl` on the profile side kept the bare
 * `z.url()` the check exists to compensate for. Collapsing them applies the
 * fix to both and removes the chance of the next hardening landing on one side
 * again.
 *
 * Like both callers, this module imports nothing but `zod` — no `@/server/db`,
 * no environment — so every schema built on it stays reachable from a client
 * component and from a unit test with `DATABASE_URL` unset.
 */

/** A trimmed, non-empty string with a caller-chosen ceiling. */
export const requiredText = (max: number) => z.string().trim().min(1).max(max)

/**
 * ISO 3166-1 alpha-2 is exactly two characters — the same number the three
 * country `<input maxLength>`s in `listing-form.tsx` and `mandate-form.tsx`
 * need, so they read it from here rather than each writing `2`.
 */
export const COUNTRY_CODE_LENGTH = 2

/** ISO 3166-1 alpha-2, case-insensitive on input — normalised to upper case before validating the shape. */
export const countryCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .regex(new RegExp(`^[A-Z]{${COUNTRY_CODE_LENGTH}}$`), 'Enter a 2-letter ISO country code.'),
  )

/**
 * The only two schemes a link this app renders may use.
 *
 * `z.url()` alone is not enough: on the installed zod (4.5.4) it accepts
 * `javascript:alert(1)` and `data:text/html,…` as valid URLs, and both fields
 * built on this are written by a user and rendered as an `<a href>` —
 * `dataRoomUrl` to every approved buyer and every manager
 * (`gated-section.tsx`), `websiteUrl` on the buyer's own profile form. React 19
 * refuses to emit a `javascript:` href and browsers block top-level navigation
 * to `data:`, so nothing is exploitable today — but that is two framework
 * runtime behaviours standing in for a validator, and this is the validator.
 * Checked with `new URL(...)` rather than a regex so the scheme is read the way
 * the browser reads it, not the way a pattern guesses at it.
 */
const HREF_PROTOCOLS: readonly string[] = ['http:', 'https:']

export const httpUrl = z.url().refine((value) => {
  try {
    return HREF_PROTOCOLS.includes(new URL(value).protocol)
  } catch {
    // Unreachable behind `z.url()`, which has already parsed the value;
    // present so a future loosening of that cannot turn a throw into a 500.
    return false
  }
}, 'Enter a link starting with http:// or https://.')

/**
 * Blank means "absent" — the shape both optional-URL columns want, since an
 * empty text input submits `''` and neither a null `dataRoomUrl` nor a null
 * `websiteUrl` should be a validation error.
 */
export const optionalHttpUrl = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, httpUrl.optional())
