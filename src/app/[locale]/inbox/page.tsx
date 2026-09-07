import { getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { requireViewer } from '@/server/session'
import { listConversations, type ConversationSummary } from '@/server/queries/conversations'
import { canModerate } from '@/lib/authz'
import { FOCUS_RING, cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/datetime'

/**
 * Every thread the viewer is a party to, newest activity first.
 *
 * `requireViewer` handles the two authentication-shaped denials (redirect to
 * `/login`, or to `/suspended`) exactly as `/dashboard` and `/profile` do, so
 * everything below is an active, signed-in viewer.
 *
 * A manager gets an explanation rather than a list. They are a party to no
 * conversation by design — `listConversations` returns them nothing and
 * `getConversation` refuses them every thread, because a manager who can read
 * every private negotiation is a privacy problem moderation does not need
 * (see `@/server/queries/conversations` and the README). `navKeysFor`
 * (`@/lib/nav`) already withholds the nav item from them, so this branch is
 * only reachable by typing the URL; it exists because the alternative — an
 * empty inbox that looks exactly like "you have no mail" — is the one
 * outcome that would read as a bug instead of as a decision.
 */
export default async function InboxPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const viewer = await requireViewer(locale)
  const t = await getTranslations('inbox')

  if (canModerate(viewer)) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Card>
          <CardHeader>
            <h1 className="text-base font-semibold text-ink">{t('manager.title')}</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-muted">{t('manager.body')}</p>
          </CardBody>
        </Card>
      </main>
    )
  }

  const conversations = await listConversations(viewer)

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('subtitle')}</p>
      </div>

      {conversations.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">{t('empty')}</p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <ul>
            {conversations.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} locale={locale} />
            ))}
          </ul>
        </Card>
      )}
    </main>
  )
}

/**
 * One thread, as a whole-row click target.
 *
 * The link is a *stretched* link on the counterparty's name, not a wrapper
 * around the row — the same fix commit `970621a` applied to `BuyerCard`, and
 * for the same reason: HTML forbids interactive content inside an `<a>`, and
 * in practice the anchor swallows every click inside it. A row like this one
 * carries an unread indicator today and is the obvious place for a per-row
 * action tomorrow, so it is built the safe way from the start. `<li>` is
 * `relative`, the name's `after:absolute after:inset-0` overlay covers the
 * row, and the focus ring lands on the name, which is the actual link.
 *
 * The listing reference is deliberately plain text rather than a link to
 * `/listings/[id]`: that would be a second anchor inside the row's click
 * target, which is exactly the trap above. The thread page links it instead,
 * where there is no outer target to collide with.
 */
function ConversationRow({
  conversation,
  locale,
}: {
  conversation: ConversationSummary
  locale: string
}) {
  const t = useTranslations('inbox')
  const name = conversation.counterparty.name ?? t(`counterparty.${conversation.counterparty.side}`)
  const timestamp = formatDateTime(conversation.lastMessageAt, locale)

  return (
    <li className="relative flex flex-col gap-1 border-b border-border px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium text-ink">
          <Link
            href={`/inbox/${conversation.id}`}
            className={cn('rounded-sm after:absolute after:inset-0', FOCUS_RING)}
          >
            {name}
          </Link>
        </h2>
        <div className="flex items-center gap-3">
          {conversation.unreadCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
              {t('unread', { count: conversation.unreadCount })}
            </span>
          ) : null}
          <span className="text-xs text-ink-muted">{timestamp}</span>
        </div>
      </div>

      {conversation.asset !== null ? (
        <p className="meta-label">
          {conversation.asset.publicRef}
          <span aria-hidden="true"> &middot; </span>
          {conversation.asset.teaserTitle}
        </p>
      ) : null}

      <p className="line-clamp-2 text-sm text-ink-muted">
        {conversation.snippet ?? t('noMessages')}
      </p>
    </li>
  )
}
