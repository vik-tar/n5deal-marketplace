/**
 * Turns an ISO 3166-1 alpha-2 country code into its flag emoji, built from the
 * two Unicode regional indicator symbols the code maps to — no image assets
 * to ship, and it composes correctly in every font that renders flag emoji.
 *
 * Pure and defensive: a malformed code (wrong length, non-letters — both
 * reachable if a query string bypassed `parseAssetFilters`, or from seed data
 * that is not actually validated against ISO-3166) returns the empty string
 * rather than emitting garbage regional-indicator characters.
 */
export function codeToFlag(countryCode: string): string {
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ''

  const REGIONAL_INDICATOR_OFFSET = 0x1f1e6 - 'A'.charCodeAt(0)
  return String.fromCodePoint(
    ...[...code].map((letter) => letter.charCodeAt(0) + REGIONAL_INDICATOR_OFFSET),
  )
}
