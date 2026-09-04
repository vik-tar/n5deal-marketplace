'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { explainMatchAction } from '@/server/actions/ai'
import type { MatchBand, MatchResult } from '@/lib/matching'
import { FOCUS_RING, cn } from '@/lib/cn'

const BAND_TONE: Record<MatchBand, BadgeTone> = {
  STRONG: 'success',
  GOOD: 'accent',
  NONE: 'neutral',
}

/**
 * The score as a coloured pill, with a disclosure listing the deterministic
 * `MatchReason`s underneath.
 *
 * Ruling 4 (Task 17) is the whole point of this component's shape: the
 * reasons list below is built entirely from `result.reasons` — each
 * translated from its `code` and `kind`, never a sentence the server sent —
 * so it is complete and correct with `aiEnabled` false and no network call
 * at all. The AI sentence is appended *underneath* that list, inside its own
 * `aiEnabled`-gated block, fetched lazily the first time the disclosure
 * opens; nothing about the deterministic section depends on whether that
 * fetch ever runs, succeeds, or is even attempted. That ordering — reasons
 * first and load-bearing, AI second and additive — is deliberate, not
 * incidental: see the module doc in `@/lib/ai/client` and this task's README
 * note.
 *
 * The AI fetch state (`explanation`) lives here, in the badge itself, rather
 * than in the disclosure panel below: the panel unmounts whenever the seller
 * closes the disclosure, and a fetch already made must not be repeated (or
 * its result lost) just because the panel was toggled shut and reopened. It
 * runs at most once per mounted `MatchBadge`, guarded by a ref rather than
 * state — the guard only needs to survive between effect runs, not to
 * trigger a render itself. `explanation` starts `undefined` ("not fetched
 * yet"), distinct from `null` ("fetched, and the action declined to answer" —
 * no key, a refusal, or a parsing failure, per `explainMatch`'s own
 * null-collapses-every-failure contract, `@/lib/ai/client`).
 *
 * `aiEnabled` is passed down from a server component (`isAiEnabled()` reads
 * `process.env`, unreachable from a client component) exactly as
 * `smart-search.tsx` and `teaser-review-panel.tsx` already do for their own
 * AI features.
 */
export function MatchBadge({
  result,
  locale,
  aiEnabled,
}: {
  result: MatchResult
  locale: string
  aiEnabled: boolean
}) {
  const t = useTranslations('matchBadge')
  const [isOpen, setIsOpen] = useState(false)
  const [explanation, setExplanation] = useState<string | null | undefined>(undefined)
  const hasStartedFetch = useRef(false)

  useEffect(() => {
    if (!isOpen || !aiEnabled || hasStartedFetch.current) return
    hasStartedFetch.current = true
    let cancelled = false
    explainMatchAction({ score: result.score, reasons: result.reasons, locale }).then((value) => {
      if (!cancelled) setExplanation(value)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, aiEnabled, result.score, result.reasons, locale])

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'inline-flex w-fit items-center gap-1.5 rounded-full transition hover:opacity-80',
          FOCUS_RING,
        )}
      >
        <Badge tone={BAND_TONE[result.band]}>
          {t(`band.${result.band}`)} · {t('scoreValue', { score: result.score })}
        </Badge>
      </button>

      {isOpen ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3">
          <p className="meta-label">{t('reasonsTitle')}</p>
          <ul className="flex flex-col gap-1.5">
            {result.reasons.map((reason) => (
              <li key={reason.code} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink">{t(`reasonCode.${reason.code}`)}</span>
                <span
                  className={cn(
                    'text-xs',
                    reason.kind === 'MATCH' && 'text-success',
                    reason.kind === 'PARTIAL' && 'text-warning',
                    reason.kind === 'MISMATCH' && 'text-danger',
                    reason.kind === 'NO_PREFERENCE' && 'text-ink-muted',
                  )}
                >
                  {t(`reasonKind.${reason.kind}`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            {result.specificity === 0
              ? t('specificityUnconstrained')
              : t('specificityNote', { count: result.specificity })}
          </p>

          {/* Ruling 4: only ever rendered when `aiEnabled` — no disabled
              placeholder, no error text, nothing at all otherwise. */}
          {aiEnabled && explanation === undefined ? (
            <p className="text-xs text-ink-muted">{t('ai.loading')}</p>
          ) : null}
          {aiEnabled && typeof explanation === 'string' ? (
            <p className="border-t border-border pt-2 text-sm text-ink">{explanation}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
