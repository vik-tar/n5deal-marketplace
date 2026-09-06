import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { MessageComposer } from '@/components/domain/message-composer'
import { MarkReadOnView } from '@/components/domain/mark-read-on-view'
import { requireViewer } from '@/server/session'
import { getConversation, type ThreadMessage } from '@/server/queries/conversations'
import { FOCUS_RING, cn } from '@/lib/cn'

/**
 * One thread, oldest message first, with the composer under it.
 *
 * `getConversation` returns `null` for a thread that does not exist *and* for
 * one this viewer is not a party to — including for a manager, deliberately
 * — so both produce the identical 404, never a 403 that would confirm the row
 * is there. That is the same rule `/listings/[id]` and `/buyers/[id]` follow.
 *
 * The listing reference *is* a link here, unlike on `/inbox`, because this
 * page has no outer click target for it to collide with. It can 404 if the
 * seller has since pulled the listing off `PUBLISHED` — the listing page
 * enforces its own visibility and this must not pre-empt it, since doing so
 * would mean re-deriving `canViewAsset` in a second place.
 */
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  const viewer = await requireViewer(locale)
  const t = await getTranslations('inbox')

  const conversation = await getConversation(id, viewer)
  if (!conversation) notFound()

  const name = conversation.counterparty.name ?? t(`counterparty.${conversation.counterparty.side}`)
  // Two different reasons produce an unnamed seller, and only one of them is
  // something the reader can act on. `discloseSellerName`
  // (`@/server/queries/conversations`) withholds the name when the NDA gate on
  // *this thread's* listing is closed — a state the buyer changes by requesting
  // access and the seller approving it — and also when the thread has no
  // listing at all (`buildThreadKey`'s `noasset` sentinel: the seller
  // cold-contacted the buyer from the directory). Pointing the second case at
  // "approve your access request for the listing" names a listing that does not
  // exist and promises a reveal that no event on this thread can ever deliver,
  // so the two get different copy.
  const sellerUnnamed =
    conversation.counterparty.name === null && conversation.counterparty.side === 'SELLER'
  const identityHint = sellerUnnamed
    ? conversation.asset !== null
      ? t('thread.identityWithheld')
      : t('thread.identityWithheldNoListing')
    : null

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <MarkReadOnView
        conversationId={conversation.id}
        unreadCount={conversation.unreadCount}
        locale={locale}
      />

      <div className="flex flex-col gap-2">
        <Link
          href="/inbox"
          className={cn('rounded-sm self-start text-sm text-accent transition hover:opacity-80', FOCUS_RING)}
        >
          {t('thread.back')}
        </Link>
        <h1 className="text-2xl font-semibold text-ink">{name}</h1>
        {identityHint !== null ? (
          <p className="text-xs text-ink-muted">{identityHint}</p>
        ) : null}
        {conversation.asset !== null ? (
          <p className="meta-label">
            <Link
              href={`/listings/${conversation.asset.id}`}
              className={cn('rounded-sm text-accent transition hover:opacity-80', FOCUS_RING)}
            >
              {conversation.asset.publicRef}
            </Link>
            <span aria-hidden="true"> &middot; </span>
            {conversation.asset.teaserTitle}
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink">{t('thread.title')}</h2>
        </CardHeader>
        <CardBody>
          {conversation.messages.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noMessages')}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {conversation.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  counterpartyName={name}
                  youLabel={t('thread.you')}
                  locale={locale}
                />
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <MessageComposer
            conversationId={conversation.id}
            canReply={conversation.canReply}
            locale={locale}
          />
        </CardBody>
      </Card>
    </main>
  )
}

/**
 * One message. `mine` is decided in the query from the sender's user id, so
 * nothing here compares identities — the component never receives a sender
 * id at all, which is one less place a thread could attribute a message to
 * the wrong party.
 *
 * The name is repeated above every message rather than only when the speaker
 * changes: a two-party thread is short, and a label that sometimes appears
 * is harder to scan than one that always does.
 */
function MessageBubble({
  message,
  counterpartyName,
  youLabel,
  locale,
}: {
  message: ThreadMessage
  counterpartyName: string
  youLabel: string
  locale: string
}) {
  const timestamp = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(message.createdAt)

  return (
    <li
      className={cn(
        'flex max-w-[85%] flex-col gap-1 rounded-card border border-border px-4 py-3',
        message.mine ? 'self-end bg-surface-2' : 'self-start bg-surface',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="meta-label">{message.mine ? youLabel : counterpartyName}</span>
        <span className="text-xs text-ink-muted">{timestamp}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap text-ink">{message.body}</p>
    </li>
  )
}
