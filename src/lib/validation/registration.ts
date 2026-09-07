import { z } from 'zod'
import { BUYER_TYPES } from '@/lib/filters/buyer-filters'
import { countryCode, requiredText } from './primitives'

/**
 * The shape of a self-service sign-up, shared by the form and by
 * `registerAccount` (`@/server/actions/registration`). Like every other schema
 * in this directory it imports nothing but `zod` and its siblings, so it stays
 * reachable from a client component and from a unit test with `DATABASE_URL`
 * unset.
 */

/**
 * The roles a stranger may give themselves. **`MANAGER` is deliberately not
 * one of them**, and the protection is structural rather than a check that
 * could be forgotten: the discriminated union below has no `MANAGER` member,
 * so there is no shape of input that parses into one. On a public demo, a
 * sign-up form that accepted a role parameter would let any visitor make
 * themselves a moderator and suspend everybody — the console is the only
 * surface that writes `UserStatus`, so that is not a recoverable mistake.
 * A manager exists only because the seed created one.
 */
export const SELF_SERVICE_ROLES = ['BUYER', 'SELLER'] as const
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number]

export const MIN_PASSWORD_LENGTH = 8

/**
 * **bcrypt ignores everything past the 72nd byte**, silently. Measured on the
 * installed `bcryptjs`: a hash of 72 `a`s verifies against those 72 `a`s
 * followed by any tail at all. Without a ceiling a user could set a long
 * passphrase, have most of it discarded, and never be told — and two distinct
 * passwords sharing a 72-byte prefix would both open the account.
 *
 * The limit is counted in **bytes, not characters**, because that is what
 * bcrypt truncates on. Seventy-two accented Spanish characters are 144 bytes
 * and would lose half of themselves under a character-based check that looked
 * correct.
 *
 * The alternative — pre-hashing with SHA-256 so any length survives — is what a
 * production system should do. It is a change to how every existing seeded
 * password verifies, which is more than this prototype should take on; refusing
 * the input honestly is the smaller, non-lying option.
 */
export const MAX_PASSWORD_BYTES = 72

/** RFC 5321's ceiling on a full address. */
export const MAX_EMAIL_LENGTH = 254

export const MAX_NAME_LENGTH = 200

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/**
 * Lower-cased and trimmed before it is validated, matching `authorize`
 * (`@/auth`) exactly. Sign-in normalises the submitted address the same way, so
 * an account registered as `Buyer@Example.com` is one the same person can sign
 * into — and `User.email` is `@unique`, so a second registration differing only
 * in case must collide rather than create a second account nobody can reach.
 */
const email = z
  .string()
  .trim()
  .max(MAX_EMAIL_LENGTH)
  .transform((value) => value.toLowerCase())
  .pipe(z.email())

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH)
  .refine((value) => byteLength(value) <= MAX_PASSWORD_BYTES, {
    message: `Use at most ${MAX_PASSWORD_BYTES} bytes — anything beyond that is silently ignored.`,
  })

const credentials = { email, password, country: countryCode }

/**
 * A discriminated union rather than one object with optional fields, so the
 * role and the profile it implies cannot disagree. A `BUYER` payload carrying
 * `companyName` does not merely ignore it — it fails to parse, which is what
 * stops `registerAccount` from ever holding a half-filled profile of the wrong
 * kind.
 */
export const registrationSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('BUYER'),
    ...credentials,
    displayName: requiredText(MAX_NAME_LENGTH),
    buyerType: z.enum(BUYER_TYPES),
  }),
  z.object({
    role: z.literal('SELLER'),
    ...credentials,
    companyName: requiredText(MAX_NAME_LENGTH),
    contactName: requiredText(MAX_NAME_LENGTH),
  }),
])

export type RegistrationInput = z.infer<typeof registrationSchema>
