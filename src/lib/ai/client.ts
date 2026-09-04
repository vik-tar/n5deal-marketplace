import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'

export const AI_MODEL = 'claude-opus-5'

let client: Anthropic | null = null

/** AI features are additive: without a key the app runs, they just hide. */
export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function getClient(): Anthropic | null {
  if (!isAiEnabled()) return null
  try {
    client ??= new Anthropic()
  } catch (error) {
    console.error('[ai] client construction failed', error)
    return null
  }
  return client
}

export interface StructuredCallOptions<T> {
  system: string
  user: string
  schema: z.ZodType<T>
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high'
}

/**
 * One structured request. Returns null for every failure mode — no key, a
 * refusal, a rate limit, an unparseable response — so callers have exactly one
 * branch to handle instead of five.
 */
export async function callStructured<T>(
  opts: StructuredCallOptions<T>,
): Promise<T | null> {
  const anthropic = getClient()
  if (anthropic === null) return null

  try {
    const response = await anthropic.messages.parse({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      output_config: {
        format: zodOutputFormat(opts.schema),
        effort: opts.effort ?? 'low',
      },
    })

    if (response.stop_reason === 'refusal') return null
    return response.parsed_output ?? null
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`[ai] API error ${error.status}: ${error.message}`)
    } else {
      console.error('[ai] unexpected failure', error)
    }
    return null
  }
}
