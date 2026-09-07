import { notFound } from 'next/navigation'
import { BuyerDashboard } from '@/components/domain/buyer-dashboard'
import { SellerDashboard } from '@/components/domain/seller-dashboard'
import { redirectNow, requireViewer } from '@/server/session'
import { getRecommendedAssets, getSellerOverview } from '@/server/queries/assets'
import { getBuyerOverview, listBuyers } from '@/server/queries/buyers'
import { canModerate, canPublishListing } from '@/lib/authz'
import { isRecommendableMatch } from '@/lib/matching'
import { isAiEnabled } from '@/lib/ai/client'
import { parseBuyerFilters } from '@/lib/filters/buyer-filters'

/**
 * How many recommended listings the buyer dashboard shows. Five is a page of
 * suggestions, not a second catalog — `/listings` is where a buyer browses,
 * and the ranking's value drops off fast once the top of it is past.
 */
const RECOMMENDATION_LIMIT = 5

/**
 * How many matched buyers the seller dashboard shows for its most recently
 * published listing. Three, for the same reason: "see all" links straight to
 * `/buyers?forAsset=…`, which is the same ranking without a cut.
 */
const MATCHED_BUYER_LIMIT = 3

/**
 * The role dispatcher. `requireViewer` handles the two authentication-shaped
 * denials (redirect to `/login` or `/suspended`) exactly as `/profile` and
 * `/listings/new` do, so everything below is an active, signed-in viewer.
 *
 * A manager is redirected to `/admin` rather than shown an empty dashboard:
 * they hold neither a `BuyerProfile` nor a `SellerProfile`, have no mandate,
 * no listings and no conversations (`canMessage` denies them by design), so
 * every section of both dashboards would be an empty state. Their console is
 * `/admin`, which refuses every non-manager viewer on its own (`listParticipants` and its siblings throw `FORBIDDEN`; the page
 * 404s independently), so this redirect is a convenience, not a gate.
 *
 * The redirect goes through `redirectNow` (`@/server/session`) rather than a
 * bare `redirect()` so its `never` return type actually narrows: `redirect`'s
 * own `never` does not survive `createNavigation`'s generics (see that
 * function's doc comment), so a bare call would leave `tsc` believing both
 * dispatch branches below are reachable for a manager, with only the runtime
 * `NEXT_REDIRECT` throw keeping them out.
 *
 * Dispatch is on the profile rows, not on `role`, because that is what the
 * two queries actually need: `getBuyerOverview` and `getRecommendedAssets`
 * take a `buyerProfileId`, `getSellerOverview` a `sellerProfileId`, and both
 * ids come from the session (`getViewer`, `@/server/session`) rather than
 * from any URL — so there is no "is this my profile" question to get wrong.
 * A signed-in viewer with neither profile row (not reachable through the
 * seeded data; a manager is already gone by then) gets a 404, not a 403,
 * matching the "hidden and non-existent look identical" rule the rest of the
 * app follows. The schema does permit one `User` to hold both profile rows;
 * no seeded account does, and such an account would get the buyer dashboard
 * because that branch is tested first. That is a deliberate precedence, not
 * an accident — but if dual-role accounts ever become real, this dispatch
 * needs a way for the viewer to choose, not a reordered `if`.
 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const viewer = await requireViewer(locale)

  if (canModerate(viewer)) {
    redirectNow('/admin', locale)
  }

  const aiEnabled = isAiEnabled()

  if (viewer.buyerProfileId !== null) {
    const [overview, recommendations] = await Promise.all([
      getBuyerOverview(viewer.buyerProfileId),
      getRecommendedAssets(viewer.buyerProfileId, RECOMMENDATION_LIMIT),
    ])
    return (
      <BuyerDashboard
        overview={overview}
        recommendations={recommendations}
        locale={locale}
        aiEnabled={aiEnabled}
      />
    )
  }

  if (viewer.sellerProfileId !== null) {
    const overview = await getSellerOverview(viewer.sellerProfileId)

    // Scoring buyers needs the listing id, which only exists after the
    // overview read — so this is a second round trip by necessity, not an
    // oversight. `listBuyers` re-checks ownership of `forAssetId` itself
    // (`loadOwnedAssetCriteria`, `@/server/queries/buyers`) and returns the
    // unscored order if the check fails, so passing an id from the overview
    // is a convenience rather than a capability.
    const matched = overview.mostRecentPublishedAssetId
      ? await listBuyers(parseBuyerFilters({}), viewer, overview.mostRecentPublishedAssetId)
      : null

    const matchedAsset =
      overview.mostRecentPublishedAssetId === null
        ? null
        : (overview.listingGroups
            .flatMap((group) => group.listings)
            .find((listing) => listing.id === overview.mostRecentPublishedAssetId) ?? null)

    return (
      <SellerDashboard
        overview={overview}
        // `match` is non-null for every row here — `listBuyers` scores the
        // whole list whenever it accepted a `forAssetId` — but the type is
        // `MatchResult | null` because the unscored call shape exists too,
        // so the filter narrows rather than asserting.
        matchedBuyers={
          matched === null
            ? []
            : matched.items
                .filter((buyer) => buyer.match !== null && isRecommendableMatch(buyer.match))
                .slice(0, MATCHED_BUYER_LIMIT)
        }
        matchedAsset={
          matchedAsset === null
            ? null
            : {
                id: matchedAsset.id,
                publicRef: matchedAsset.publicRef,
                teaserTitle: matchedAsset.teaserTitle,
              }
        }
        canCreateListing={canPublishListing(viewer)}
        locale={locale}
        aiEnabled={aiEnabled}
      />
    )
  }

  notFound()
}
