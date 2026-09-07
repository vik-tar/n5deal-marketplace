'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { sendMessage } from '@/server/actions/messages'
import type { ActionError } from '@/server/actions/types'
import { attempt } from '@/lib/action-result'

/** The longest message `sendMessage` (`@/server/actions/messages`) will accept. */
const MAX_BODY_LENGTH = 4000

/**
 * The reply box at the foot of a thread.
 *
 * `canReply` comes from `getConversation` (`@/server/queries/conversations`),
 * which asks `canMessage` against the counterparty's *live* account status.
 * When it is false the textarea and the button are disabled and the reason is
 * printed above them, rather than the composer disappearing: a seller whose
 * buyer was suspended mid-negotiation should learn what happened, not find a
 * control missing. `sendMessage` re-checks the same predicate server-side, so
 * this is presentation, not enforcement — a caller who re-enables the button
 * in dev tools still gets `FORBIDDEN`.
 *
 * Empty and whitespace-only bodies are refused here by disabling the button
 * rather than by submitting and rendering an error, because there is nothing
 * for the server to tell the writer that they cannot already see. The server
 * still rejects them (`INVALID`); this only avoids a pointless round trip.
 *
 * No `router.refresh()` on success: `sendMessage` revalidates this thread's
 * path, and what that buys is precisely the refreshed RSC payload Next
 * returns with the action's own response — the new message appears because
 * the server re-rendered, the same way the access-request queue updates after
 * a decision.
 */
export function MessageComposer({
  conversationId,
  canReply,
  locale,
}: {
  conversationId: string
  canReply: boolean
  locale: string
}) {
  const t = useTranslations('inbox.composer')
  const [body, setBody] = useState('')
  const [error, setError] = useState<ActionError | null>(null)
  const [isPending, startTransition] = useTransition()

  const trimmed = body.trim()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (trimmed.length === 0) return
    setError(null)
    startTransition(async () => {
      const result = await attempt('send-message', sendMessage({ conversationId, body: trimmed, locale }))
      if (!result.ok) {
        setError(result.error)
        return
      }
      setBody('')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {!canReply ? (
        <p role="status" className="text-sm text-ink-muted">
          {t('blocked')}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="message-body" className="meta-label">
          {t('label')}
        </label>
        <textarea
          id="message-body"
          name="body"
          rows={3}
          maxLength={MAX_BODY_LENGTH}
          disabled={!canReply || isPending}
          placeholder={t('placeholder')}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="field-control"
        />
      </div>
      <div>
        <Button type="submit" disabled={!canReply || isPending || trimmed.length === 0}>
          {isPending ? t('sending') : t('send')}
        </Button>
      </div>
      {error !== null ? (
        <p role="alert" className="text-xs text-danger">
          {t(`error.${error}`)}
        </p>
      ) : null}
    </form>
  )
}
