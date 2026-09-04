'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { runTeaserReview } from '@/server/actions/assets'
import type { TeaserReview } from '@/lib/ai/teaser-review'

/**
 * The one feature in this project where AI guards the confidentiality
 * boundary rather than decorating the interface. Renders nothing at all when
 * `aiEnabled` is false (ruling 5, Task 15) — not a disabled button, not an
 * error toast, because there is no dead control to render in the first
 * place: `isAiEnabled()` is read server-side (`@/lib/ai/client`) and passed
 * down, since a client component cannot read `process.env` itself
 * (`smart-search.tsx` documents the identical constraint).
 *
 * Calls `runTeaserReview` (`@/server/actions/assets`) against the listing's
 * *persisted* fields — this checks whatever `saveDraft` last wrote, not
 * whatever is currently typed but unsaved in `listing-form.tsx`'s fields.
 * Every `excerpt` on a `leak` this panel renders has already been verified,
 * inside `reviewTeaser`, to occur verbatim in the teaser text
 * (`keepQuotedLeaks`, `@/lib/ai/teaser-review`) — this component quotes and
 * highlights it as evidence without re-checking that itself.
 *
 * The findings are advisory (ruling 6): the seller may submit the listing
 * regardless of what this panel finds, and it says so plainly, whether or
 * not it has been run yet.
 */
export function TeaserReviewPanel({
  assetId,
  locale,
  aiEnabled,
}: {
  assetId: string
  locale: string
  aiEnabled: boolean
}) {
  const t = useTranslations('listingForm.review')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<TeaserReview | null>(null)
  const [hasRun, setHasRun] = useState(false)

  if (!aiEnabled) return null

  function handleCheck() {
    startTransition(async () => {
      const review = await runTeaserReview({ assetId, locale })
      setResult(review)
      setHasRun(true)
    })
  }

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <h2 className="text-base font-semibold text-ink">{t('title')}</h2>
        <p className="text-sm text-ink-muted">{t('intro')}</p>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div>
          <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={handleCheck}>
            {isPending ? t('checking') : t('trigger')}
          </Button>
        </div>

        {isPending ? <p className="text-sm text-ink-muted">{t('loading')}</p> : null}

        {!isPending && hasRun ? <ReviewOutcome result={result} t={t} /> : null}

        <p className="text-xs text-ink-muted">{t('advisory')}</p>
      </CardBody>
    </Card>
  )
}

/**
 * Loose on purpose, matching every other `t()` alias in this codebase
 * (`listings/page.tsx`, `listings/[id]/page.tsx`): this app does not augment
 * next-intl's `Messages` type.
 */
type Translator = (key: string, values?: Record<string, string | number>) => string

function ReviewOutcome({ result, t }: { result: TeaserReview | null; t: Translator }) {
  if (result === null) {
    return <p className="text-sm text-ink-muted">{t('unavailable')}</p>
  }

  if (result.leaks.length === 0) {
    return <p className="text-sm text-success">{t('clean')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="meta-label">{t('leaksTitle')}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {result.leaks.map((leak, index) => (
            <li key={index} className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-ink">&ldquo;{leak.excerpt}&rdquo;</p>
              <p className="mt-1 text-ink-muted">{leak.explanation}</p>
            </li>
          ))}
        </ul>
      </div>
      {result.suggestions.length > 0 ? (
        <div>
          <p className="meta-label">{t('suggestionsTitle')}</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-muted">
            {result.suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
