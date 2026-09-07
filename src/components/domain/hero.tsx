import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import { SIGN_IN_HREF } from '@/lib/nav'
import { formatCents } from '@/lib/money'
import { FOCUS_RING, cn } from '@/lib/cn'

/**
 * Both calls to action are `Link`s styled as buttons rather than a `Button`
 * wrapped in a `Link`. HTML forbids interactive content inside an `<a>`, and
 * this codebase has already paid for that once — `BuyerCard` nested a
 * `<button>` inside a whole-card anchor and the anchor swallowed the click
 * (commit `970621a`). `SiteHeader`'s sign-in link and the catalog's empty
 * state use the same shape, so the classes below deliberately mirror
 * `Button`'s `primary` and `secondary` variants instead of importing them:
 * the variant maps are keyed by `<button>` semantics, not by "looks like a
 * button".
 */
const CTA_BASE =
  'inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-medium transition'

/**
 * The landing hero: proposition, the two live marketplace figures, and the
 * "Start Buying" / "Start Selling" pair.
 *
 * Both figures arrive already computed by `getMarketplaceSummary`
 * (`@/server/queries/assets`), which derives them from the catalog's own
 * query. Nothing is counted, summed, or filtered here — a component that did
 * any of that would be a second definition of "what is in the catalog", which
 * is exactly how a landing page starts lying about its own marketplace.
 *
 * Both buttons point at `/login` (`SIGN_IN_HREF`, `@/lib/nav`), as the spec
 * asks: the page is an acquisition surface for anonymous visitors, and both
 * sides of the market start by signing in. An already-signed-in viewer who
 * clicks one is bounced straight back here by `/login`'s own guard, which is
 * harmless but is the reason these are not the right controls for a
 * signed-in audience.
 */
export function Hero({
  listingCount,
  totalValueCents,
  locale,
}: {
  listingCount: number
  totalValueCents: number
  locale: string
}) {
  const t = useTranslations('home')

  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-surface">
      {/* Decorative accent wash. `overflow-hidden` on the section and
          `pointer-events-none` here keep it from widening the page or
          intercepting a click; `-z-10` on an `isolate` parent keeps it behind
          the copy without escaping into the rest of the page's stacking. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -right-24 -z-10 h-[26rem] w-[26rem] rounded-full bg-accent/15 blur-3xl"
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Badge tone="accent">{t('hero.eyebrow')}</Badge>

        <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-balance text-ink sm:text-5xl">
          {t('hero.title')}
        </h1>

        <p className="mt-5 max-w-2xl text-base text-ink-muted sm:text-lg">{t('hero.body')}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={SIGN_IN_HREF}
            className={cn(CTA_BASE, 'bg-accent text-accent-ink hover:opacity-90', FOCUS_RING)}
          >
            {t('hero.ctaBuy')}
          </Link>
          <Link
            href={SIGN_IN_HREF}
            className={cn(
              CTA_BASE,
              'border border-border bg-surface-2 text-ink hover:bg-surface',
              FOCUS_RING,
            )}
          >
            {t('hero.ctaSell')}
          </Link>
        </div>

        {/* `gap-px` over a `border`-coloured background draws the hairline
            between the two panels, so there is no divider element to get the
            wrong side of at a narrow width where the pair stacks. */}
        <dl className="mt-14 grid max-w-2xl gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2">
          <Stat
            value={new Intl.NumberFormat(locale).format(listingCount)}
            label={t('hero.stats.listings', { count: listingCount })}
          />
          <Stat
            value={formatCents(totalValueCents, locale)}
            label={t('hero.stats.combinedValue')}
          />
        </dl>
      </div>
    </section>
  )
}

/**
 * One figure: the value large, its label small underneath.
 *
 * `order` rather than markup order, because a `<dl>` wants the `<dt>` first
 * and the design wants the `<dd>` on top. `mt-auto` then pins the label to
 * the bottom of the panel, which is what keeps the pair aligned when one
 * label wraps and the other does not — visible in Russian, where "combined
 * asking price" is one line and "licensed institutions for sale" is two, and
 * a naive `flex-col-reverse` left the two big numbers at different heights.
 */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col bg-surface-2 px-5 py-6">
      <dt className="meta-label order-2 mt-auto pt-1">{label}</dt>
      <dd className="order-1 text-3xl font-semibold text-ink sm:text-4xl">{value}</dd>
    </div>
  )
}
