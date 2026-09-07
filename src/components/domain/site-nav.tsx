'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { NAV_HREF, activeNavKey, unreadBadgeLabel, type NavKey } from '@/lib/nav'
import { hasUnsavedChanges } from '@/lib/unsaved-changes'
import { FOCUS_RING, cn } from '@/lib/cn'

/** One primary nav item. `label` is already translated — never pass a literal. */
export interface SiteNavItem {
  key: NavKey
  label: string
  /**
   * A count to superscript on this item, or `0`/absent for none. Today only
   * `inbox` carries one; the shape is per-item rather than an `unreadCount`
   * prop so a second badge does not mean changing this component's signature.
   */
  badgeCount?: number
  /**
   * The badge read out instead of the bare digits — "2 unread messages", not
   * "2". Already translated, and required whenever `badgeCount` is set: a
   * number floating beside a link name is meaningless to a screen reader, and
   * the digits themselves are `aria-hidden` below precisely so this is what
   * gets announced.
   */
  badgeLabel?: string
}

/**
 * The header's primary navigation, with the current page announced as
 * `aria-current="page"` — the convention `Tabs` (`@/components/ui/tabs`) and
 * the admin console's toggle links already follow, and the one thing this nav
 * was missing: a screen-reader user could hear the six links and not which of
 * them they were standing on.
 *
 * A client component, deliberately, even though `SiteHeader` around it is a
 * server component and everything else it renders is server-rendered. Next.js
 * 16 does not offer a server-side route read at all — "Reading the current URL
 * from a Server Component is not supported. This design is intentional to
 * support layout state being preserved across page navigations."
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`)
 * — and the second half of that sentence is why a header prop would have been
 * the wrong answer even if one had been available: this nav lives in the
 * locale layout, which is *not* re-rendered when the router moves between two
 * pages that share it, so a pathname read once on the server would keep
 * announcing the page the visitor first landed on. The hook re-reads on every
 * navigation, which is the behaviour the attribute has to have.
 *
 * Only the pathname is client state. The labels are translated on the server
 * and the visible key set is decided there too (`navKeysFor`), so no
 * authorization rule crosses into the browser bundle.
 */
export function SiteNav({
  items,
  ariaLabel,
  discardPrompt,
}: {
  items: readonly SiteNavItem[]
  ariaLabel: string
  /**
   * Asked before a link throws away unsaved work. Already translated — this
   * component takes no `t`, for the same reason it takes `label` and not a key.
   */
  discardPrompt: string
}) {
  const pathname = usePathname()
  const currentKey = activeNavKey(
    pathname,
    items.map((item) => item.key),
  )

  return (
    // The negative margins give the scroll container enough padding for a
    // child's focus ring — `overflow-x-auto` clips at the padding box.
    <nav
      aria-label={ariaLabel}
      className="-mx-1 -my-2 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-2"
    >
      {items.map((item) => {
        const isCurrent = item.key === currentKey
        const badge = unreadBadgeLabel(item.badgeCount ?? 0)
        return (
          <Link
            key={item.key}
            href={NAV_HREF[item.key]}
            aria-current={isCurrent ? 'page' : undefined}
            // `onNavigate` rather than `onClick`: it fires only for a real
            // client-side navigation, so a middle-click or Cmd+click opening a
            // new tab — which throws nothing away, the form stays open here —
            // is not interrupted. `preventDefault()` cancels the navigation and
            // leaves the page exactly as it was.
            onNavigate={(event) => {
              if (hasUnsavedChanges() && !window.confirm(discardPrompt)) event.preventDefault()
            }}
            className={cn(
              'rounded-sm px-2 py-1 text-sm whitespace-nowrap transition',
              FOCUS_RING,
              // Announced *and* shown: `aria-current` alone would leave a
              // sighted keyboard user with no indication either.
              isCurrent ? 'bg-surface-2 font-medium text-ink' : 'text-ink-muted hover:text-ink',
              // The badge is positioned inside this padding rather than
              // overhanging the link, because the `<nav>` above scrolls
              // horizontally (`overflow-x-auto`) and clips at its own padding
              // box — and `inbox` is the last item in a buyer's key set, so an
              // overhanging badge would be clipped for exactly the viewer who
              // has one.
              badge !== null && 'relative pr-6',
            )}
          >
            {item.label}
            {badge !== null ? (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-0 right-0 inline-flex items-center justify-center',
                    'min-w-4 rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold text-white',
                  )}
                >
                  {badge}
                </span>
                <span className="sr-only">{item.badgeLabel}</span>
              </>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
