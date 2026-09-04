import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

export default createMiddleware(routing)

/**
 * `api` stays excluded so this never locale-rewrites Auth.js's route handler
 * at `/api/auth/[...nextauth]` — a rewrite there would break the credentials
 * callback, session, and CSRF-token endpoints Auth.js's client-side plumbing
 * expects at the literal, unprefixed `/api/auth/*` paths.
 */
export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
}
