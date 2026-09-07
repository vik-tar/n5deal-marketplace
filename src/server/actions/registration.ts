'use server'

import bcrypt from 'bcryptjs'
import { AuthError } from 'next-auth'
import { Prisma } from '@/generated/prisma/client'
import { signIn } from '@/auth'
import { prisma } from '@/server/db'
import { getViewer } from '@/server/session'
import { getPathname, redirect } from '@/i18n/navigation'
import { toAppLocale } from '@/i18n/locale'
import { registrationSchema, type RegistrationInput } from '@/lib/validation/registration'
import type { ActionError } from './types'

/**
 * `'EMAIL_TAKEN'` is not part of `ActionError`: it is meaningful to exactly one
 * action, and widening the shared union would oblige all seven other error
 * namespaces to carry a string none of them can ever produce. A sibling type
 * instead, the same way `SaveDraftResult` (`@/server/actions/assets`) carries
 * the fields the shared shape has no room for. `register.error.*` in
 * `messages/*.json` is total over *this* union, which is the rule
 * `@/server/actions/types` states.
 */
export type RegisterError = ActionError | 'EMAIL_TAKEN'
export type RegisterResult = { ok: true } | { ok: false; error: RegisterError }

export interface RegisterAccountInput {
  input: RegistrationInput
  locale: string
}

/** bcrypt work factor, matching `prisma/seed.ts` so seeded and new accounts verify alike. */
const BCRYPT_ROUNDS = 10

/**
 * Creates a `BUYER` or a `SELLER` account and signs the new user straight in.
 *
 * **Telling the caller that an address is taken is deliberate, and it is not
 * the same decision sign-in makes.** This does leak whether an address has an
 * account. The alternative on a registration form — refusing without saying why
 * — leaves a person who genuinely forgot they had signed up with no way to
 * work out what is wrong, which is a worse trade than the enumeration it
 * prevents, and the enumeration is available from any registration form on the
 * internet anyway. **Sign-in keeps the opposite rule**: `authorize` (`@/auth`)
 * compares against a dummy hash so a wrong address and a wrong password cost
 * the same time and answer the same thing. Neither decision is a precedent for
 * the other.
 *
 * **The role is not read from the caller's word for it.** It is whatever
 * `registrationSchema`'s discriminated union parsed, and that union has no
 * `MANAGER` member (`@/lib/validation/registration`), so no payload can produce
 * one. A stranger cannot make themselves a moderator.
 *
 * **The user row and its profile row are written in one transaction.** A
 * `User` with no `BuyerProfile` is an account that can sign in and then be
 * refused by `/profile`, `/dashboard` and every buyer action — `getViewer`
 * would hand back a viewer whose `buyerProfileId` is `null`, which every
 * predicate in `@/lib/authz` reads as "not a buyer". Half a registration is
 * worse than none, so neither row can exist without the other.
 *
 * **An already signed-in visitor is refused.** Registering while holding a
 * session is not a flow this app has: it would leave the browser authenticated
 * as one account having just created another, with no way to tell which is
 * which. The page redirects them away before the form renders; this is the
 * same rule enforced where it cannot be skipped.
 *
 * On success it does not return — `signIn` throws Next's redirect, exactly as
 * `signInAction` (`@/server/actions/auth`) does, so the new user lands on the
 * app already authenticated rather than on a sign-in form asking for the
 * password they just chose. The `AuthError` branch is unreachable in practice
 * (these credentials were written moments ago) and is handled rather than
 * thrown so that a failure there cannot present as a crash on a page that has
 * already created the account.
 */
export async function registerAccount(payload: RegisterAccountInput): Promise<RegisterResult> {
  const locale = toAppLocale(payload.locale)

  if (await getViewer()) return { ok: false, error: 'FORBIDDEN' }

  const parsed = registrationSchema.safeParse(payload.input)
  if (!parsed.success) return { ok: false, error: 'INVALID' }
  const data = parsed.data

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS)

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: data.email, passwordHash, role: data.role, locale },
        select: { id: true },
      })

      if (data.role === 'BUYER') {
        await tx.buyerProfile.create({
          data: {
            userId: user.id,
            displayName: data.displayName,
            buyerType: data.buyerType,
            country: data.country,
          },
        })
        return
      }

      await tx.sellerProfile.create({
        data: {
          userId: user.id,
          companyName: data.companyName,
          contactName: data.contactName,
          country: data.country,
        },
      })
    })
  } catch (error) {
    // `User.email` is the only `@unique` column this transaction can violate,
    // and the read-then-write race it closes is real: two sign-ups with the
    // same address in the same instant both see no row and both insert.
    // Postgres refuses the second, and this reports it as the ordinary
    // "address already registered" it is rather than as a crash.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, error: 'EMAIL_TAKEN' }
    }
    throw error
  }

  try {
    await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirectTo: getPathname({ href: '/', locale }),
    })
  } catch (error) {
    // `signIn`'s success path throws Next's `NEXT_REDIRECT`, which is not an
    // `AuthError` and must keep propagating for the redirect to happen.
    if (error instanceof AuthError) {
      redirect({ href: { pathname: '/login', query: { registered: '1' } }, locale })
    }
    throw error
  }

  // Unreachable: `signIn` above either redirects or throws.
  return { ok: true }
}
