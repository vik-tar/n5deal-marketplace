'use client'

import { useEffect } from 'react'

/**
 * The last-resort boundary: it catches what `[locale]/error.tsx` cannot,
 * namely a failure in `[locale]/layout.tsx` itself. An error boundary never
 * wraps the layout of its own segment, and that layout does real work —
 * `getViewer()` reads Postgres on every render, and `@/server/db` throws by
 * design when `DATABASE_URL` is missing — so "the database is unreachable" is
 * exactly the failure that lands here rather than one segment down.
 *
 * This file replaces the root layout when active, which drives every decision
 * below:
 *
 * - It renders its own `<html>` and `<body>`. Required by the convention.
 * - **The styles are inline, not Tailwind.** `globals.css` is imported by the
 *   layout this page is replacing, so no class in it resolves here. The values
 *   are the `@theme` tokens copied by hand; a change to the palette must be
 *   made in both places, which is the price of a page that renders when the
 *   layout does not.
 * - **The copy is English only.** `NextIntlClientProvider` lives in that same
 *   layout, so `useTranslations` has nothing to read. Sniffing the locale out
 *   of `window.location` and keeping a second, hand-written copy of two
 *   sentences outside `messages/*.json` is precisely the drift this codebase
 *   avoids elsewhere; a last-resort page that is reached only when the site
 *   itself is broken is the one place where one language is the right trade.
 * - `<title>` is the React element, not a `metadata` export: error boundaries
 *   are Client Components and cannot export metadata.
 *
 * Next 16 passes `retry`, not `reset` — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error.digest ?? '(no digest)', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          colorScheme: 'dark',
          background: '#0a0b0d',
          color: '#f4f5f7',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <title>N5Deal — something went wrong</title>
        <div
          style={{
            maxWidth: '28rem',
            width: '100%',
            border: '1px solid #262a32',
            background: '#121418',
            borderRadius: '0.75rem',
            padding: '1.25rem',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#9aa1ad' }}>
            The marketplace could not be loaded. This is a failure on our side, not
            something you did. Try again in a moment.
          </p>
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                height: '2.5rem',
                padding: '0 1rem',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                background: '#3b82f6',
                color: '#ffffff',
              }}
            >
              Try again
            </button>
            {/* A bare `<a>`, and `next/link` would be the bug here rather than
                the fix. This boundary is standing in for a root layout that
                failed to render; a client-side `Link` navigation would hand
                the same broken React tree the next route instead of replacing
                the document. A full page load is the recovery. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '2.5rem',
                padding: '0 1rem',
                borderRadius: '0.375rem',
                border: '1px solid #262a32',
                background: '#1a1d23',
                color: '#f4f5f7',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Go to the home page
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
