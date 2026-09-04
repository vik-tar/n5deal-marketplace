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

/** Parses a user-entered euro amount into integer cents. Returns null when unparseable. */
export function parseEuros(input: string): number | null {
  const normalised = input.replace(/[\s ,]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null
  return Math.round(Number(normalised) * 100)
}
