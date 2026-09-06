'use client'

import { useEffect, useRef, useTransition } from 'react'
import { markRead } from '@/server/actions/messages'

/**
 * Renders nothing; stamps `readAt` on the thread's unread messages once the
 * viewer actually has it open.
 *
 * Marking read is a *mutation*, so it cannot happen while the thread page
 * renders — Next forbids writing during render, and `markRead` revalidates
 * three paths besides. It is therefore a Server Action fired from an effect,
 * which is the only moment "the viewer opened this" is a fact rather than a
 * guess. The alternative — folding the write into `getConversation` the way
 * `getAssetDetail` increments `viewCount` — was rejected for that reason:
 * a view counter that over-counts is a statistic, a read receipt that
 * over-clears is a message the recipient never saw marked as read.
 *
 * It runs at most once per thread. `unreadCount === 0` skips the call
 * entirely, so re-rendering after the revalidation `markRead` itself
 * triggers cannot loop; the ref additionally holds the id already handled,
 * so React's development-mode double-invocation of effects fires one
 * request, not two, and navigating between two threads without unmounting
 * still marks the second one.
 */
export function MarkReadOnView({
  conversationId,
  unreadCount,
  locale,
}: {
  conversationId: string
  unreadCount: number
  locale: string
}) {
  const handled = useRef<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (unreadCount === 0) return
    if (handled.current === conversationId) return
    handled.current = conversationId
    startTransition(async () => {
      await markRead({ conversationId, locale })
    })
  }, [conversationId, unreadCount, locale])

  return null
}
