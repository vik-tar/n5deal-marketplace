import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'

const AI_MODEL = 'claude-opus-5'

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
  /**
   * Defaults to `DEFAULT_MAX_TOKENS`. Raise it freely and never tune it down
   * to save money: billing and the output-tokens-per-minute rate limit both
   * count the tokens actually generated, so a ceiling that is never reached
   * costs nothing. See `DEFAULT_MAX_TOKENS` for why a low ceiling is actively
   * dangerous on a thinking model.
   */
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high'
}

/**
 * `AI_MODEL` is Claude Opus 5, where adaptive thinking is **on by default** —
 * omitting the `thinking` parameter does not mean "no thinking", it means
 * "adaptive". Thinking tokens are output tokens and count against
 * `max_tokens`, so a tight ceiling is not a cost control here: it is a way for
 * the model to spend its whole budget reasoning and get cut off before it
 * emits the JSON the schema is waiting for. That surfaces as
 * `stop_reason: 'max_tokens'` with no `parsed_output` — which this module's
 * never-throws contract would otherwise collapse into the same silent `null`
 * as "no API key", making a truncation indistinguishable from a feature that
 * is simply switched off.
 *
 * The obvious ceiling for these call sites is 400-1024 — the intended output
 * is a short JSON object — and that is the wrong number, because it reserves
 * nothing for reasoning. None of the three features has ever run against the
 * real API, so a truncation here would show up for the first time in
 * production; the ceiling is set where it cannot.
 */
const DEFAULT_MAX_TOKENS = 4096

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
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      output_config: {
        format: zodOutputFormat(opts.schema),
        effort: opts.effort ?? 'low',
      },
    })

    if (response.stop_reason === 'refusal') return null
    // Still `null` to the caller — the one-branch contract above is the whole
    // point of this function — but logged, because "the model ran out of room"
    // is a configuration mistake we can fix, and it is otherwise
    // indistinguishable from "no key configured" at every call site.
    if (response.stop_reason === 'max_tokens') {
      console.error(
        `[ai] hit max_tokens before completing the structured output; raise maxTokens (currently ${opts.maxTokens ?? DEFAULT_MAX_TOKENS})`,
      )
      return null
    }
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
