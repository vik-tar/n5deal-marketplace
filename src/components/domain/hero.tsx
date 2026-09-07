import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import { NAV_HREF, SIGN_IN_HREF, type NavKey } from '@/lib/nav'
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

/** The first button in the pair; the rest are the quieter outline treatment. */
const CTA_PRIMARY = 'bg-accent text-accent-ink hover:opacity-90'
const CTA_SECONDARY = 'border border-border bg-surface-2 text-ink hover:bg-surface'

/**
 * The landing hero: proposition, the two live marketplace figures, and a pair
 * of calls to action.
 *
 * Both figures arrive already computed by `getMarketplaceSummary`
 * (`@/server/queries/assets`), which derives them from the catalog's own
 * query. Nothing is counted, summed, or filtered here — a component that did
 * any of that would be a second definition of "what is in the catalog", which
 * is exactly how a landing page starts lying about its own marketplace.
 *
 * **The pair of buttons depends on who is looking**, and `ctaKeys` is how the
 * page says which. Empty — an anonymous visitor — renders the spec's "Start
 * Buying" / "Start Selling", both pointing at `/login` (`SIGN_IN_HREF`), as
 * the brief requires. Non-empty renders those keys' own destinations from
 * `NAV_HREF`.
 *
 * The reason it is not simply always the spec's pair: `signInAction` sends a
 * signed-in viewer to `/`, so this page is the *first* screen after every
 * sign-in — and `/login`'s own guard bounces an active viewer straight back
 * here, which made both buttons do literally nothing (no navigation, no
 * flash) for the majority audience. Changing where they point for everyone
 * would deviate from a spec that names `/login` twice; changing who sees them
 * does not, because "Start Buying" is a call to action addressed to somebody
 * who has not started yet.
 *
 * Which keys those are is `heroCtaKeys`'s decision (`@/lib/nav`), not this
 * component's: that module already owns which entry points a viewer may be
 * offered, is pure, and is unit-tested. This component only renders them.
 */
export function Hero({
  listingCount,
  totalValueCents,
  ctaKeys,
  locale,
}: {
  listingCount: number
  totalValueCents: number
  /** From `heroCtaKeys` (`@/lib/nav`); empty for an anonymous visitor. */
  ctaKeys: NavKey[]
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
        {/* `whitespace-normal` overrides `Badge`'s own `whitespace-nowrap`,
            and `max-w-full` keeps the pill inside the hero's padding box.
            Without both, this 47-character sentence had a constant intrinsic
            width — 319px in English, 395px in Russian — at *every* viewport,
            and the section's `overflow-hidden` above cut it off in silence:
            `scrollWidth === clientWidth`, so no scrollbar and no sideways
            page. Measured clipped at 320 in both locales and at 320/360/390
            in Russian, where an iPhone 12–15 read "ЛИЦЕНЗИРОВАННЫЕ
            ОРГАНИЗАЦИИ, СДЕЛКИ БЕЗ ОГЛАСК" with the right border gone.

            `Badge` itself is deliberately untouched. `whitespace-nowrap` is
            load-bearing at its twenty-odd other call sites, which are short
            status labels ("PENDING REVIEW", a country chip, an `included`
            item) that must never break across two lines — the bug is this
            call site's, not the component's, because `Badge` is for labels
            and this is a sentence. It is the only sentence-length badge in
            the app; a second one should get its own component rather than a
            second copy of this override.

            `text-balance` because the wrap it now permits is what the reader
            sees: without it the Russian eyebrow breaks after "БЕЗ" and
            leaves "ОГЛАСКИ" alone on line two, with it after the comma. The
            `h1` below uses it for the same reason.

            Rejected: dropping `Badge` here and rendering the eyebrow as
            plain `meta-label` text. Measured equally clip-free, but it
            removes the accent pill from the reviewed hero at every width in
            order to fix a bug that only exists below 414px — a design change
            wearing a bug fix's clothes. Wherever the sentence already fitted
            (English from 360 up, Russian from 430 up) the markup above still
            renders exactly what shipped. */}
        <Badge tone="accent" className="max-w-full text-balance whitespace-normal">
          {t('hero.eyebrow')}
        </Badge>

        <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-balance text-ink sm:text-5xl">
          {t('hero.title')}
        </h1>

        <p className="mt-5 max-w-2xl text-base text-ink-muted sm:text-lg">{t('hero.body')}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {ctaKeys.length === 0 ? (
            <>
              <Link
                href={SIGN_IN_HREF}
                className={cn(CTA_BASE, CTA_PRIMARY, FOCUS_RING)}
              >
                {t('hero.ctaBuy')}
              </Link>
              <Link
                href={SIGN_IN_HREF}
                className={cn(CTA_BASE, CTA_SECONDARY, FOCUS_RING)}
              >
                {t('hero.ctaSell')}
              </Link>
            </>
          ) : (
            // `NAV_HREF[key]` rather than a href alongside the key, so the
            // hero and the header can never point the same key at two
            // different pages. The label is keyed the same way but read from
            // `home.hero.cta.*` rather than reused from `nav.*`: those are
            // navigation labels ("Dashboard", "All listings") and these are
            // calls to action ("Go to your dashboard"), and collapsing the
            // two would make every future nav rename silently rewrite the
            // hero.
            ctaKeys.map((key, index) => (
              <Link
                key={key}
                href={NAV_HREF[key]}
                className={cn(
                  CTA_BASE,
                  index === 0 ? CTA_PRIMARY : CTA_SECONDARY,
                  FOCUS_RING,
                )}
              >
                {t(`hero.cta.${key}`)}
              </Link>
            ))
          )}
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
