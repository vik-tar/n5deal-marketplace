import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link, getPathname } from '@/i18n/navigation'
import { Tabs } from '@/components/ui/tabs'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ParticipantTable } from '@/components/domain/participant-table'
import { AdminAssetTable } from '@/components/domain/admin-asset-table'
import {
  countListingsAwaitingReview,
  listAllAssets,
  listModerationLog,
  listParticipants,
} from '@/server/queries/admin'
import { MODERATION_LOG_LIMIT } from '@/server/queries/admin-where'
import { requireViewer } from '@/server/session'
import { canModerate, type Viewer } from '@/lib/authz'
import { FOCUS_RING, cn } from '@/lib/cn'
import type { RawSearchParams } from '@/lib/filters/shared'
import {
  ADMIN_ASSET_STATUSES,
  ADMIN_ROLES,
  ADMIN_TABS,
  ADMIN_USER_STATUSES,
  adminFiltersToSearchParams,
  parseAdminFilters,
  type AdminFilters,
} from '@/lib/filters/admin-filters'

const ADMIN_PATH = '/admin' as const

/**
 * Loose on purpose, matching every other `t()` alias in this codebase
 * (`listings/page.tsx`, `buyers/page.tsx`): this app does not augment
 * next-intl's `Messages` type, so every `t()` call already takes a plain
 * string key.
 */
type Translator = (key: string, values?: Record<string, string | number>) => string

/**
 * The platform manager's console: participants, listings and the audit trail,
 * on one page with the active tab in the URL.
 *
 * **Two independent refusals, answering two different questions.**
 * `requireViewer` handles the authentication-shaped ones exactly as
 * `/profile` and `/dashboard` do (signed out → `/login`, suspended →
 * `/suspended`). Then `canModerate` decides whether this viewer gets a
 * console at all, and a non-manager gets `notFound()` — a 404, not a 403,
 * because "hidden and non-existent look identical" is the rule the whole app
 * follows and there is no reason to confirm to a buyer that an admin console
 * exists. The queries behind the tabs *also* refuse, by throwing
 * (`assertCanModerate`, `@/server/queries/admin-where`); that is not
 * redundant with this check but underneath it — this decides what a browser
 * sees, that decides whether the data may be assembled at all, for any caller
 * written later that forgets this page's guard.
 *
 * **The tab is a query parameter, not a route.** `Tabs`
 * (`@/components/ui/tabs`) is link-based and works without client JavaScript,
 * one route means one place the filter state is parsed, and every filter the
 * manager has set travels with the tab switch — so a filtered console view is
 * a URL somebody can paste to a colleague, which is what the brief means by
 * shareable.
 *
 * Only the active tab's query runs. The three tables have nothing to do with
 * each other, and reading all of them to render one is work nobody asked for.
 * The single exception is `countListingsAwaitingReview`, which runs on every
 * tab because the review queue is the one thing on this console that is
 * *owed* rather than merely available, and a manager reading the participants
 * table should still see that two listings have been waiting.
 */
export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const { locale } = await params
  const rawSearchParams = await searchParams
  const filters = parseAdminFilters(rawSearchParams)

  const viewer = await requireViewer(locale)
  if (!canModerate(viewer)) notFound()

  const [t, pendingReviewCount] = await Promise.all([
    getTranslations('admin'),
    countListingsAwaitingReview(viewer),
  ])

  const tabItems = ADMIN_TABS.map((tab) => ({
    id: tab,
    label:
      tab === 'assets' && pendingReviewCount > 0
        ? t('tabs.assetsWithQueue', { count: pendingReviewCount })
        : t(`tabs.${tab}`),
    href: {
      pathname: ADMIN_PATH,
      query: Object.fromEntries(adminFiltersToSearchParams({ ...filters, tab })),
    },
  }))

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>

      <div className="mt-6">
        <Tabs items={tabItems} activeId={filters.tab} ariaLabel={t('tabs.ariaLabel')} />
      </div>

      <div className="mt-6">
        {filters.tab === 'participants' ? (
          <ParticipantsPanel filters={filters} viewer={viewer} locale={locale} />
        ) : null}
        {filters.tab === 'assets' ? (
          <AssetsPanel filters={filters} viewer={viewer} locale={locale} />
        ) : null}
        {filters.tab === 'log' ? <LogPanel viewer={viewer} locale={locale} /> : null}
      </div>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Filter controls
// ---------------------------------------------------------------------------

/**
 * One filter value as a toggle link. It shares `FilterSidebar`'s rule
 * (`@/components/domain/filter-sidebar`) that the whole filter state lives in
 * the URL — pressing a value adds or removes it and navigates — but not its
 * markup: the sidebar's category and status controls are real checkboxes in a
 * client component that calls `router.push`, where these are plain `Link`s
 * and need no client JavaScript at all.
 *
 * Which is why the current value is announced with `aria-current` and not
 * `aria-pressed`. An earlier version of this file used `aria-pressed` and
 * cited the sidebar as the precedent; the sidebar sets no such attribute, and
 * `aria-pressed` is defined only for `role="button"` — on an `<a>` it is
 * invalid, and a screen reader either drops it or announces a toggle button
 * that is not there. This codebase's one `aria-pressed` is on a genuine
 * `<button>` (`@/components/domain/mandate-form`), and its links say what
 * they are with `aria-current`: `page` for the tab bar
 * (`@/components/ui/tabs`), `true` for the locale switcher. `true` is the
 * right member here too — an applied filter is a current state, but it is not
 * a page.
 */
function ToggleLink({
  label,
  active,
  query,
  ariaLabel,
}: {
  label: string
  active: boolean
  query: Record<string, string>
  ariaLabel: string
}) {
  return (
    <Link
      href={{ pathname: ADMIN_PATH, query }}
      aria-current={active ? 'true' : undefined}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs transition',
        FOCUS_RING,
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-border bg-surface-2 text-ink-muted hover:border-accent/60',
      )}
    >
      {label}
    </Link>
  )
}

function toggled<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}

/**
 * The free-text search over email and display name.
 *
 * A plain `method="get"` form rather than a client component with
 * `router.push`, which is what `BuyerSearch` (`@/components/domain/buyer-search`)
 * does for the buyer catalog. Both are legitimate; this one is chosen because
 * the console has exactly one text input, and a GET form gets submit-on-Enter,
 * the browser's own clear button and full no-JavaScript operation for free,
 * where the client version would add a `'use client'` boundary to a page
 * whose interactivity is otherwise entirely inside the moderation dialogs.
 * The cost is that submitting is a document navigation rather than a
 * client-side one — on a page that reloads its table anyway, that is not a
 * cost worth a component.
 *
 * The other filters ride along as hidden inputs, because a GET form replaces
 * the query string rather than merging into it: without them, searching would
 * silently clear the role and status filters the manager just set.
 */
function SearchForm({
  filters,
  locale,
  t,
}: {
  filters: AdminFilters
  locale: string
  t: Translator
}) {
  const carried = adminFiltersToSearchParams({ ...filters, q: '' })

  return (
    <form
      method="get"
      // `getPathname` adds the locale prefix the same way `Link` does. The
      // locale here is the validated route segment (`src/app/[locale]/layout.tsx`
      // `notFound()`s on anything else), not client-supplied input — unlike a
      // Server Action's `locale` field, which goes through `toAppLocale`.
      action={getPathname({ href: ADMIN_PATH, locale })}
      className="flex flex-wrap items-center gap-2"
    >
      {[...carried.entries()].map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor="admin-search" className="sr-only">
        {t('participants.searchPlaceholder')}
      </label>
      <input
        id="admin-search"
        type="search"
        name="q"
        defaultValue={filters.q}
        placeholder={t('participants.searchPlaceholder')}
        className="field-control min-w-48 flex-1"
      />
      <Button type="submit" variant="secondary" size="sm">
        {t('participants.searchSubmit')}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

async function ParticipantsPanel({
  filters,
  viewer,
  locale,
}: {
  filters: AdminFilters
  viewer: Viewer
  locale: string
}) {
  const [t, tRole, tStatus, rows] = await Promise.all([
    getTranslations('admin'),
    getTranslations('admin.role'),
    // The account-status labels come from the shared `status` namespace —
    // the same words `StatusPill` renders on the rows below, rather than a
    // second set the filter could drift from.
    getTranslations('status'),
    listParticipants(filters, viewer),
  ])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="meta-label">{t('participants.filterRole')}</span>
        {ADMIN_ROLES.map((role) => (
          <ToggleLink
            key={role}
            label={tRole(role)}
            active={filters.roles.includes(role)}
            ariaLabel={t('participants.filterRoleToggle', { value: tRole(role) })}
            query={Object.fromEntries(
              adminFiltersToSearchParams({ ...filters, roles: toggled(filters.roles, role) }),
            )}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="meta-label">{t('participants.filterStatus')}</span>
        {ADMIN_USER_STATUSES.map((status) => (
          <ToggleLink
            key={status}
            label={tStatus(status)}
            active={filters.userStatuses.includes(status)}
            ariaLabel={t('participants.filterStatusToggle', { value: tStatus(status) })}
            query={Object.fromEntries(
              adminFiltersToSearchParams({
                ...filters,
                userStatuses: toggled(filters.userStatuses, status),
              }),
            )}
          />
        ))}
      </div>

      <SearchForm filters={filters} locale={locale} t={t} />

      <p className="text-sm text-ink-muted">{t('participants.count', { count: rows.length })}</p>

      <ParticipantTable rows={rows} viewerUserId={viewer.userId} locale={locale} />
    </section>
  )
}

async function AssetsPanel({
  filters,
  viewer,
  locale,
}: {
  filters: AdminFilters
  viewer: Viewer
  locale: string
}) {
  const [t, tStatus, rows] = await Promise.all([
    getTranslations('admin'),
    getTranslations('status'),
    listAllAssets(filters, viewer),
  ])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="meta-label">{t('assets.filterStatus')}</span>
        {ADMIN_ASSET_STATUSES.map((status) => (
          <ToggleLink
            key={status}
            label={tStatus(status)}
            active={filters.assetStatuses.includes(status)}
            ariaLabel={t('assets.filterStatusToggle', { value: tStatus(status) })}
            query={Object.fromEntries(
              adminFiltersToSearchParams({
                ...filters,
                assetStatuses: toggled(filters.assetStatuses, status),
              }),
            )}
          />
        ))}
      </div>

      <p className="text-sm text-ink-muted">{t('assets.count', { count: rows.length })}</p>

      <AdminAssetTable rows={rows} locale={locale} />
    </section>
  )
}

/**
 * The audit trail. Read-only by construction — there is no control here that
 * writes anything, and `ModerationLog` has no update path anywhere in the
 * application: rows are created inside the same transaction as the change
 * they describe and are never edited or deleted. That is what makes it an
 * audit trail rather than an activity feed.
 */
async function LogPanel({ viewer, locale }: { viewer: Viewer; locale: string }) {
  const [t, { items, truncated }] = await Promise.all([
    getTranslations('admin'),
    listModerationLog(viewer),
  ])

  if (items.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border px-6 py-12 text-center text-sm text-ink-muted">
        {t('log.empty')}
      </p>
    )
  }

  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{t('log.count', { count: items.length })}</p>

      <ul className="flex flex-col gap-3">
        {items.map((entry) => (
          <li key={entry.id}>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {t(`action.${entry.action}`)}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {t(`target.${entry.targetType}`, { value: entry.targetLabel })}
                  </span>
                </div>
                <span className="text-xs whitespace-nowrap text-ink-muted">
                  {formatter.format(entry.createdAt)}
                </span>
              </CardHeader>
              <CardBody className="flex flex-col gap-1">
                <p className="text-sm text-ink">{entry.reason}</p>
                <p className="text-xs text-ink-muted">{t('log.actor', { email: entry.actorEmail })}</p>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      {truncated ? (
        <p className="text-xs text-ink-muted">{t('log.truncated', { limit: MODERATION_LOG_LIMIT })}</p>
      ) : null}
    </section>
  )
}
