'use server'

import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/auth'
import { redirect, getPathname } from '@/i18n/navigation'
import { prisma } from '@/server/db'

/**
 * Shared by the manual sign-in form and the three demo buttons (`demo-login.tsx`)
 * — both post the same `email`/`password` fields, the demo buttons just fill
 * them with a hidden input instead of asking the reviewer to type them.
 *
 * `locale` is bound by the caller via `signInAction.bind(null, locale)` so the
 * success redirect — and the back-to-login redirect on failure — land on a
 * locale-prefixed path instead of guessing it from the request.
 */
export async function signInAction(locale: string, formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').toLowerCase().trim()
  const password = String(formData.get('password') ?? '')

  // Decided *before* calling `signIn`, from the submitted address's current
  // status, so a suspended user's very first request after authenticating
  // lands on `/suspended` instead of a normal page that quietly shows their
  // email in the header. This lookup runs for every attempt regardless of
  // whether the address exists, and its result is only ever consulted on the
  // success path below — a failed `signIn` always redirects to
  // `/login?error=1`, ignoring this value entirely — so an unknown address
  // cannot be distinguished by which destination it "would have" used.
  const existing = email
    ? await prisma.user.findUnique({ where: { email }, select: { status: true } })
    : null
  const redirectTo = getPathname({
    href: existing && existing.status !== 'ACTIVE' ? '/suspended' : '/',
    locale,
  })

  try {
    await signIn('credentials', { email, password, redirectTo })
  } catch (error) {
    // `signIn`'s own success redirect throws Next's internal NEXT_REDIRECT
    // control-flow error, which is not an `AuthError` — only a rejected
    // `authorize()` (bad credentials) produces one. Anything else is a real
    // error and must keep propagating.
    if (error instanceof AuthError) {
      redirect({ href: { pathname: '/login', query: { error: '1' } }, locale })
    }
    throw error
  }
}

export async function signOutAction(locale: string): Promise<void> {
  await signOut({ redirectTo: getPathname({ href: '/', locale }) })
}
