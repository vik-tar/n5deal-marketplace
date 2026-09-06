import { hasLocale } from 'next-intl'
import { routing, type AppLocale } from './routing'

/**
 * The one place an arbitrary `string` becomes a locale this app will act on.
 *
 * Every Server Action in this codebase takes its `locale` from its own typed
 * input — `{ conversationId, locale }`, `{ assetId, locale }` — because an
 * action has no route params of its own to read one from. That input is
 * client-supplied, so `locale` is client-supplied, and it flows straight into
 * `redirect()` through `redirectNow` (`@/server/session`) the moment the
 * caller turns out to be signed out or suspended. Measured before this fix:
 * an unauthenticated `markRead` with `locale: "/evil.example.com"` answered
 * `x-action-redirect: //evil.example.com/login;push` — a protocol-relative
 * URL, which is an open redirect in shape. It was not practically exploitable
 * (a cross-origin caller cannot set the `Next-Action` header an action needs),
 * but six call sites were feeding it.
 *
 * Falling back to `routing.defaultLocale` rather than throwing is deliberate.
 * The *destination* of these redirects (`/login`, `/suspended`, `/admin`) is
 * decided by the session and never by the caller, so the only thing a bad
 * `locale` can still influence is which translation of a login page a visitor
 * lands on. Refusing loudly would turn a cosmetic mismatch into an error
 * boundary on a path whose whole job is to recover gracefully.
 *
 * This check lives beside `routing` rather than inside `@/server/session`,
 * where it is *enforced*, for the reason every `*-where.ts` module in
 * `@/server/queries` exists: `session.ts` imports `@/auth`, which constructs a
 * Prisma client at import time, so nothing that imports it can be unit-tested
 * without a database. Keeping the rule here keeps it testable as ordinary pure
 * logic (`tests/unit/i18n/locale.test.ts`). It is deliberately not in
 * `routing.ts` itself either: `@/proxy` — the middleware — imports that
 * module, and `hasLocale` comes from the `next-intl` root entry point, which
 * pulls in more than an edge bundle has any reason to carry.
 *
 * `hasLocale` is the same predicate `src/app/[locale]/layout.tsx` uses to
 * decide whether a locale segment in the URL is real; the layout `notFound()`s
 * on a bad one because a URL is a page request, while this one substitutes
 * because a Server Action's locale is a formatting hint attached to a mutation
 * that has already been authorized.
 */
export function toAppLocale(locale: string): AppLocale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
}
