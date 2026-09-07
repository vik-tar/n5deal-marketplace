import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardBody } from '@/components/ui/card'
import {
  assetFiltersToSearchParams,
  type CategoryCount,
} from '@/lib/filters/asset-filters'
import { FOCUS_RING, cn } from '@/lib/cn'

const LISTINGS_PATH = '/listings' as const

/**
 * The landing page's five category tiles, each a link into the catalog
 * pre-filtered to that category.
 *
 * The URL is built with `assetFiltersToSearchParams`
 * (`@/lib/filters/asset-filters`), never by hand. That module is the single
 * owner of the catalog's URL contract — it is what `parseAssetFilters` reads
 * back, what the sidebar and the filter chips write, and what is unit-tested
 * — so a hand-written `?categories=BANK` here would be a second, untested
 * encoding that rots silently the day the first one changes. The
 * `Object.fromEntries` shape is the same one `listings/page.tsx` passes to its
 * sort tabs and pagination.
 *
 * `counts` is passed in rather than fetched: it comes from
 * `getMarketplaceSummary` (`@/server/queries/assets`), where it is the
 * catalog's own per-category facet count under no filters — which is exactly
 * the total the tile's own URL produces when followed. A count computed here
 * would be a second definition of what is in the catalog.
 *
 * The whole tile is the link, which is safe precisely because a tile holds no
 * interactive content of its own (the trap `BuyerCard` documents). The grid
 * reflows from two columns to five rather than scrolling sideways, so a
 * narrow viewport never makes the page scroll horizontally.
 */
export function CategoryStrip({ counts }: { counts: readonly CategoryCount[] }) {
  const t = useTranslations('home')
  // Category names live in the `assets` namespace, where the sidebar, the
  // chips and the cards already read them. A landing-page copy of the same
  // five names would be five more strings to keep translated in step.
  const tAssets = useTranslations('assets')

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {counts.map(({ category, count }) => (
        <li key={category}>
          <Link
            href={{
              pathname: LISTINGS_PATH,
              query: Object.fromEntries(
                assetFiltersToSearchParams({ categories: [category] }),
              ),
            }}
            className={cn('block h-full rounded-card', FOCUS_RING)}
          >
            <Card className="h-full transition hover:border-accent/60">
              <CardBody className="flex h-full flex-col gap-1 px-4 py-4">
                <p className="text-2xl font-semibold text-ink">{count}</p>
                <p className="text-sm font-medium text-ink">
                  {tAssets(`category.${category}`)}
                </p>
                <p className="meta-label mt-auto pt-2">
                  {t('categories.listings', { count })}
                </p>
              </CardBody>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}
