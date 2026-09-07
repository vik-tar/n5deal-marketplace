import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { AssetCard } from '@/components/domain/asset-card'
import { CategoryStrip } from '@/components/domain/category-strip'
import { Hero } from '@/components/domain/hero'
import { getMarketplaceSummary } from '@/server/queries/assets'
import { getViewer } from '@/server/session'
import { FOCUS_RING, cn } from '@/lib/cn'

/**
 * The public landing page.
 *
 * Every figure it prints — the hero's listing count and combined asking
 * price, each category tile's count, and the six recent listings — comes from
 * a single `getMarketplaceSummary` call, which is itself built on the
 * catalog's own `listAssets`. That indirection is the point of this page:
 * `VISIBILITY_FLOOR` (`@/server/queries/asset-where`) is `status: 'PUBLISHED'`
 * **and** an active seller account, and a landing page that re-derives either
 * half is one edit away from advertising listings its own catalog hides. The
 * seeded database makes the gap concrete: 35 rows are `PUBLISHED`, 34 are in
 * the catalog, and the missing one belongs to a suspended seller.
 *
 * Nothing beyond `TeaserAsset` reaches this page — `listAssets` returns rows
 * through `toTeaserAsset` (`@/lib/dto/asset`), which builds the teaser from a
 * public allowlist rather than by deleting confidential columns, so an
 * anonymous visitor here sees exactly what an anonymous visitor at
 * `/listings` sees.
 *
 * `viewer` is read for one reason only: to hand it to the same query the
 * catalog calls, so both surfaces answer the same question for the same
 * person. The page renders identically for everyone today.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const viewer = await getViewer()

  const [summary, t] = await Promise.all([
    getMarketplaceSummary(viewer),
    getTranslations('home'),
  ])

  return (
    <main>
      <Hero
        listingCount={summary.listingCount}
        totalValueCents={summary.totalValueCents}
        locale={locale}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-4 py-14 sm:px-6">
        <section aria-labelledby="home-categories-title">
          <SectionHeading id="home-categories-title" title={t('categories.title')}>
            {t('categories.subtitle')}
          </SectionHeading>
          <div className="mt-5">
            <CategoryStrip counts={summary.categories} />
          </div>
        </section>

        <section aria-labelledby="home-recent-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading id="home-recent-title" title={t('recent.title')}>
              {t('recent.subtitle')}
            </SectionHeading>
            <Link
              href="/listings"
              className={cn(
                'rounded-sm text-sm font-medium text-accent transition hover:opacity-80',
                FOCUS_RING,
              )}
            >
              {t('recent.viewAll')}
            </Link>
          </div>

          {summary.recent.length === 0 ? (
            // Not unreachable defensive code: a marketplace with every listing
            // sold or every seller suspended is a real state of the seeded
            // data (Task 20 can produce it from the admin console), and the
            // alternative is a section heading over nothing at all.
            <p className="mt-5 rounded-card border border-dashed border-border px-6 py-12 text-center text-sm text-ink-muted">
              {t('recent.empty')}
            </p>
          ) : (
            // The catalog's own `AssetCard`, in the catalog's own order — two
            // columns from `lg` up so six listings read as a sample rather
            // than as a second, shorter catalog. Below that the cards stack,
            // exactly as they do at `/listings`.
            <ul className="mt-5 grid gap-4 lg:grid-cols-2">
              {summary.recent.map((asset) => (
                <li key={asset.id}>
                  <AssetCard asset={asset} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

/** A section's title and its one-line explanation, with the id its `<section>` points at. */
function SectionHeading({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 id={id} className="text-xl font-semibold text-ink">
        {title}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">{children}</p>
    </div>
  )
}
