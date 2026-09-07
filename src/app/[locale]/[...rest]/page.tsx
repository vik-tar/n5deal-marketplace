import { notFound } from 'next/navigation'

/**
 * A route that exists only to fail, so that a URL matching nothing still
 * fails *inside* `[locale]` and reaches `[locale]/not-found.tsx`.
 *
 * `not-found.tsx` is a boundary, not a route: it catches `notFound()` thrown
 * within its own segment tree, and a request that matches no route at all
 * never enters that tree. Measured before this file existed:
 * `/en/listings/nope` (a real route, `notFound()` from the page) rendered the
 * localized 404 with the site header, while `/en/does-not-exist` (no route)
 * returned Next's built-in page — no header, no locale, no way back — even
 * though the middleware had already put the locale in the URL.
 *
 * The documented alternative is `app/global-not-found.tsx`, which Next's own
 * docs name for exactly this shape (a root layout under a top-level dynamic
 * segment). It is still behind `experimental.globalNotFound` in Next 16 and
 * bypasses the layout, so it would need its own copy of the header, the
 * stylesheet and the translations. A catch-all that defers to the boundary
 * already written costs four lines and no flag.
 *
 * Lowest routing priority by construction: every static and dynamic segment
 * under `[locale]` is matched before a catch-all, so this can only ever run
 * for a path nothing else claimed.
 */
export default function LocaleCatchAll(): never {
  notFound()
}
