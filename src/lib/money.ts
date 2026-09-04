/** Formats integer euro cents for display. Compact above €1M. */
export function formatCents(cents: number, locale: string): string {
  const euros = Math.round(cents / 100)
  const useCompact = euros >= 1_000_000
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    notation: useCompact ? 'compact' : 'standard',
    maximumFractionDigits: useCompact ? 1 : 0,
  }).format(euros)
}

/**
 * Parses a user-entered euro amount into integer cents. Returns null when unparseable.
 *
 * Accepted: plain digits with an optional 1-2 decimal places (e.g. "1234.56",
 * "0.5"), with spaces (regular or non-breaking) and commas tolerated as
 * grouping separators (e.g. "250 000", "250,000", "1,234.56").
 *
 * Rejected (returns null): a dot used as a thousands-grouping separator, e.g.
 * "1.234,56" — this is genuinely ambiguous against "1.234" meaning one euro
 * twenty-three cents, so it is deliberately NOT special-cased. A visible
 * validation error beats a silently wrong amount. Do not "fix" this without
 * an explicit, unambiguous input format decision.
 */
export function parseEuros(input: string): number | null {
  const normalised = input.replace(/[\s ,]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null
  return Math.round(Number(normalised) * 100)
}
