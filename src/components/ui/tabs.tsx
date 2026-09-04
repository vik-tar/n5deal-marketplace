import type { ComponentProps } from 'react'
import { Link } from '@/i18n/navigation'
import { FOCUS_RING, cn } from '@/lib/cn'

type LinkHref = ComponentProps<typeof Link>['href']

export type TabItem = {
  /** Compared against `activeId` to decide which tab is current. */
  id: string
  /** Already-translated text. Never pass a literal. */
  label: string
  /** Locale-agnostic target; `Link` adds the locale prefix. */
  href: LinkHref
}

/**
 * Link-based tabs. The active tab lives in the URL, so a filtered view is
 * shareable and the whole control works without client JavaScript.
 */
export function Tabs({
  items,
  activeId,
  ariaLabel,
  className,
}: {
  items: readonly TabItem[]
  activeId: string
  /** Accessible name for the tab bar. Already translated. */
  ariaLabel?: string
  className?: string
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn('flex items-center gap-1 border-b border-border', className)}
    >
      {items.map((item) => {
        const isActive = item.id === activeId
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
              FOCUS_RING,
              isActive
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
