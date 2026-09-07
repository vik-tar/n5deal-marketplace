import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/**
 * The Content-Security-Policy this app can carry **without a nonce
 * pipeline**, and no more.
 *
 * `frame-ancestors 'none'` is the one that matters here. The manager console
 * suspends accounts, removes them and publishes listings from one-click
 * `<dialog>` submits, and until this header existed those pages could be
 * framed by any origin — clickjacking a manager into a suspension needs no
 * XSS, only an invisible iframe over a plausible button. `X-Frame-Options:
 * DENY` is sent alongside it rather than instead of it: `frame-ancestors` is
 * the modern, more precise directive and the one Safari and Chrome honour
 * inside a CSP, while `X-Frame-Options` is what an older or embedded
 * WebView will actually read. Neither is redundant.
 *
 * `base-uri 'self'`, `object-src 'none'` and `form-action 'self'` come free:
 * this app injects no `<base>`, embeds no plugins, and every form —
 * including every Server Action POST — targets its own origin.
 *
 * **No `script-src` and no `default-src`.** Next.js inlines its bootstrap
 * and its RSC flight payload as `<script>` elements, so any useful
 * `script-src` needs either `'unsafe-inline'` (which buys nothing) or a
 * per-request nonce threaded through `src/proxy.ts` and every rendered
 * script. That is a real change to the request path, not a config line, and
 * shipping a directive that would have to be loosened to `'unsafe-inline'`
 * to work is worse than shipping none — it reads as protection that is not
 * there. Recorded as the deliberate limit of this header set, not an
 * oversight.
 *
 * `Strict-Transport-Security` is inert over plain HTTP (browsers ignore it
 * on an insecure transport), so it costs nothing locally and is correct on
 * the Vercel deployment the README describes. `Permissions-Policy` turns off
 * three capabilities this app never asks for, which is the whole point of
 * declaring it.
 */
const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  async headers() {
    // `/:path*` rather than a per-route list: a header set that has to be
    // remembered for each new route is one that will be missed on one.
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
}

export default withNextIntl(nextConfig)
