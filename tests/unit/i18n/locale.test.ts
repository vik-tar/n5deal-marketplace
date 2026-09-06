import { describe, expect, it } from 'vitest'
import { toAppLocale } from '@/i18n/locale'
import { routing } from '@/i18n/routing'

/**
 * `toAppLocale` is the guard between a client-supplied `locale` and
 * `redirect()` (`redirectNow`, `@/server/session`). These assert the shape of
 * the guard directly, without a database or a session, which is the whole
 * reason the rule lives in `@/i18n/locale` and not in `session.ts` where it is
 * enforced — `session.ts` imports `@/auth`, which constructs a Prisma client
 * at import time.
 */
describe('toAppLocale', () => {
  it('passes every configured locale through unchanged', () => {
    for (const locale of routing.locales) {
      expect(toAppLocale(locale)).toBe(locale)
    }
  })

  it('falls back to the default locale for an unknown one', () => {
    expect(toAppLocale('de')).toBe(routing.defaultLocale)
    expect(toAppLocale('')).toBe(routing.defaultLocale)
  })

  /**
   * The regression this exists for. `next-intl`'s `redirect` interpolates the
   * locale into the path it hands Next, so a locale that is itself path-shaped
   * escapes the path. `"/evil.example.com"` produced the protocol-relative
   * `//evil.example.com/login`, which a browser resolves against the current
   * scheme and follows off-origin.
   */
  it('refuses a path-shaped locale that would escape into an open redirect', () => {
    expect(toAppLocale('/evil.example.com')).toBe(routing.defaultLocale)
    expect(toAppLocale('//evil.example.com')).toBe(routing.defaultLocale)
    expect(toAppLocale('https://evil.example.com')).toBe(routing.defaultLocale)
    expect(toAppLocale('../../evil')).toBe(routing.defaultLocale)
  })

  /**
   * Case and whitespace are not normalised on purpose: `routing.locales` is
   * the single source of truth for what a locale *is*, and quietly repairing
   * `"EN"` here would make this function disagree with the `hasLocale` check
   * `src/app/[locale]/layout.tsx` runs on the URL segment, which 404s it.
   */
  it('does not repair a near-miss into a locale the URL router would reject', () => {
    expect(toAppLocale('EN')).toBe(routing.defaultLocale)
    expect(toAppLocale(' ru ')).toBe(routing.defaultLocale)
  })
})
