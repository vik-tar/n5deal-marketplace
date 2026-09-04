import { beforeEach, describe, expect, it } from 'vitest'
import { isAiEnabled } from '@/lib/ai/client'
import { parseSearchQuery } from '@/lib/ai/search'
import { explainMatch } from '@/lib/ai/explain'
import { reviewTeaser } from '@/lib/ai/teaser-review'

describe('graceful degradation without an API key', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('reports AI as disabled', () => {
    expect(isAiEnabled()).toBe(false)
  })

  it('returns null from the search parser instead of throwing', async () => {
    await expect(parseSearchQuery('anything')).resolves.toBeNull()
  })

  it('returns null from the match explainer', async () => {
    await expect(
      explainMatch({ score: 80, reasons: [], locale: 'en' }),
    ).resolves.toBeNull()
  })

  it('returns null from the teaser reviewer', async () => {
    await expect(
      reviewTeaser({
        teaserTitle: 'A title',
        teaserDescription: 'A description',
        legalName: 'Acme Ltd',
        revenueCents: 100_000_00,
        ebitdaCents: 10_000_00,
        clientCount: 10,
      }),
    ).resolves.toBeNull()
  })
})
