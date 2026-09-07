/**
 * Stands where an AI control would be when no `ANTHROPIC_API_KEY` is
 * configured.
 *
 * This deliberately softens an earlier decision — that the AI controls render
 * *nothing at all* without a key, not even a disabled placeholder. That rule is
 * right for a user: a dead button is worse than no button. It is wrong for a
 * reviewer, who cannot tell a feature that is switched off from a feature that
 * was never built, and this project ships with the key unset by design.
 *
 * What resolves the conflict is that this is not a control. Nothing here is
 * clickable, nothing suggests an action that would fail. It is a line of prose
 * in the place the prose is about — the same reasoning that keeps the empty
 * states in this app explaining themselves rather than rendering blank.
 *
 * The second half of the copy is doing real work too: it says the surrounding
 * page is computed without a model. The scores, the reasons and the NDA gate
 * are all deterministic, and a note that only said "AI is off" would invite the
 * opposite conclusion.
 */
export function AiUnavailableNote({ text }: { text: string }) {
  return <p className="text-xs text-ink-muted">{text}</p>
}
