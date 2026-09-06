'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { startConversation, type StartConversationTarget } from '@/server/actions/messages'
import type { ActionError } from '@/server/actions/types'

/**
 * The one control that opens a thread, used from both sides of the market:
 * "Contact seller" on a listing (`target.kind === 'asset'`) and "Contact
 * buyer" on a buyer profile (`target.kind === 'buyer'`). The label follows
 * the target rather than a separate prop, so the two entry points cannot
 * drift into saying different things about the same action.
 *
 * `canContact` is decided server-side — `AssetDetail.canContactSeller`
 * (`@/server/queries/assets`) and `BuyerDetail.canContact`
 * (`@/server/queries/buyers`), both of which answer "would
 * `startConversation` accept this?" rather than the looser "may this viewer
 * message anyone". This component does not re-derive it; it presents the
 * answer and explains it.
 *
 * The button is rendered **disabled, never omitted**, when the answer is no
 * (Task 17's shape, kept): a manager, or a viewer looking at a suspended
 * counterparty, sees why the action is unavailable instead of a missing
 * control they would reasonably assume is a bug. The two explanations differ
 * because the remedies do — an anonymous visitor needs to sign in, and
 * everyone else is being told the account cannot be messaged at all.
 *
 * On success the action returns the thread's id and this navigates into it,
 * exactly as `listing-form.tsx` navigates to the edit page for the listing
 * `saveDraft` just created. Nothing here decides anything: the same
 * authorization runs inside `startConversation` whether this button is
 * disabled or not.
 */
export function ContactButton({
  target,
  canContact,
  isAnonymous,
  locale,
}: {
  target: StartConversationTarget
  canContact: boolean
  isAnonymous: boolean
  locale: string
}) {
  const t = useTranslations('contact')
  const router = useRouter()
  const [error, setError] = useState<ActionError | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await startConversation({ target, locale })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/inbox/${result.conversationId}`)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={!canContact || isPending}
          onClick={handleClick}
        >
          {isPending ? t('opening') : t(target.kind === 'asset' ? 'seller' : 'buyer')}
        </Button>
      </div>
      {!canContact ? (
        <p className="text-xs text-ink-muted">{isAnonymous ? t('signInFirst') : t('unavailable')}</p>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-xs text-danger">
          {t(`error.${error}`)}
        </p>
      ) : null}
    </div>
  )
}
