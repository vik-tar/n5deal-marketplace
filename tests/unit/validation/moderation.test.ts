import { describe, expect, it } from 'vitest'
import {
  MAX_MODERATION_REASON,
  MIN_MODERATION_REASON,
  isValidModerationReason,
  moderationReasonSchema,
} from '@/lib/validation/moderation'

/**
 * The reason is the whole of design decision D4's audit value: an unlogged
 * status change is the hole the feature exists to close, and a one-character
 * `reason` closes it only on paper. These assert the floor is a real floor —
 * in particular that whitespace cannot reach it, which is the failure mode a
 * `min(10)` without a `trim()` would have.
 */
describe('moderationReasonSchema', () => {
  it('rejects anything shorter than the minimum', () => {
    expect(moderationReasonSchema.safeParse('').success).toBe(false)
    expect(moderationReasonSchema.safeParse('too short').success).toBe(false)
    expect(moderationReasonSchema.safeParse('a'.repeat(MIN_MODERATION_REASON - 1)).success).toBe(
      false,
    )
  })

  it('accepts exactly the minimum', () => {
    expect(moderationReasonSchema.safeParse('a'.repeat(MIN_MODERATION_REASON)).success).toBe(true)
  })

  it('measures the trimmed value, so padding cannot satisfy the minimum', () => {
    const padded = ' '.repeat(MIN_MODERATION_REASON * 2)
    expect(padded.length).toBeGreaterThan(MIN_MODERATION_REASON)
    expect(moderationReasonSchema.safeParse(padded).success).toBe(false)
    // Nine real characters with padding around them is still nine characters.
    expect(moderationReasonSchema.safeParse('   spammer   ').success).toBe(false)
  })

  it('returns the trimmed value, so the log never stores the padding', () => {
    const parsed = moderationReasonSchema.safeParse('  Misrepresented a licence status.  ')
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data).toBe('Misrepresented a licence status.')
  })

  it('rejects a reason past the ceiling', () => {
    expect(moderationReasonSchema.safeParse('a'.repeat(MAX_MODERATION_REASON)).success).toBe(true)
    expect(moderationReasonSchema.safeParse('a'.repeat(MAX_MODERATION_REASON + 1)).success).toBe(
      false,
    )
  })
})

/**
 * The dialog's confirm button and the Server Action must agree exactly, or
 * the console offers a button that is guaranteed to come back `INVALID`.
 * These two are one rule with two callers, so they are asserted against the
 * same fixtures.
 */
describe('isValidModerationReason', () => {
  it('answers identically to the schema on every fixture', () => {
    const fixtures = [
      '',
      ' ',
      'short',
      '         ',
      'Duplicate.',
      'Misrepresented a licence renewal status to a buyer.',
      'a'.repeat(MAX_MODERATION_REASON + 1),
    ]
    for (const fixture of fixtures) {
      expect(isValidModerationReason(fixture)).toBe(moderationReasonSchema.safeParse(fixture).success)
    }
  })

  it('accepts a real ten-character reason', () => {
    expect(isValidModerationReason('Duplicate.')).toBe(true)
  })
})
