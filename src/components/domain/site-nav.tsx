'use client'

import { Link, usePathname } from '@/i18n/navigation'
import { NAV_HREF, activeNavKey, type NavKey } from '@/lib/nav'
import { FOCUS_RING, cn } from '@/lib/cn'

/** One primary nav item. `label` is already translated — never pass a literal. */
export interface SiteNavItem {
  key: NavKey
  label: string
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
}: {
  items: readonly SiteNavItem[]
  ariaLabel: string
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
        return (
          <Link
            key={item.key}
            href={NAV_HREF[item.key]}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              'rounded-sm px-2 py-1 text-sm whitespace-nowrap transition',
              FOCUS_RING,
              // Announced *and* shown: `aria-current` alone would leave a
              // sighted keyboard user with no indication either.
              isCurrent ? 'bg-surface-2 font-medium text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
