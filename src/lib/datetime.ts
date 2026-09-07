/**
 * The two date formats this application renders, named once.
 *
 * Money has had exactly one formatter since Task 6 (`formatCents`,
 * `@/lib/money`); dates had six inline `new Intl.DateTimeFormat(...)` calls
 * across the inbox, the admin log, the buyer dashboard, the request queue and
 * the access gate, each re-choosing its own option bag. Two option sets were
 * actually in use — `dateStyle: 'medium'` on its own, and that plus
 * `timeStyle: 'short'` — but nothing held them apart on purpose or held them
 * together, so a seventh site was one copy-paste away from inventing a third.
 *
 * The rule the two sets encode: a **timestamp** (when a message arrived, when
 * a moderation decision was taken) shows the time, because minutes matter to
 * the reader; a **date** (when access was requested or decided) does not,
 * because those are read as calendar events. Pick by that question, not by
 * which call site you copied from.
 *
 * Argument order mirrors `formatCents(value, locale)`: the value first, the
 * locale second.
 *
 * The `*Formatter` factories exist because a list renders one formatter for
 * many rows — `Intl.DateTimeFormat` construction is the expensive half, and
 * the admin log and the buyer dashboard both hoist it out of their `map`.
 * Reach for `formatDate`/`formatDateTime` for a single value.
 */

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

export function dateFormatter(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, DATE_OPTIONS)
}

export function dateTimeFormatter(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, DATE_TIME_OPTIONS)
}

export function formatDate(value: Date, locale: string): string {
  return dateFormatter(locale).format(value)
}

export function formatDateTime(value: Date, locale: string): string {
  return dateTimeFormatter(locale).format(value)
}
