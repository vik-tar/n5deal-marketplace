/**
 * The shape of a bound next-intl translator, as this codebase's render
 * helpers consume it.
 *
 * Deliberately loose — `(key: string, ...)` rather than the exact union of a
 * namespace's keys — because this app does not augment next-intl's `Messages`
 * type, so every `t()` call already takes a plain string key. Tightening it
 * would mean generating a key union per namespace, which is a build-time
 * concern this prototype does not carry.
 *
 * It lives here rather than in each consumer because it was declared six
 * times, byte-identically, across `listings/page.tsx`, `listings/[id]/page.tsx`,
 * `buyers/page.tsx`, `admin/page.tsx`, `buyer-card.tsx` and
 * `teaser-review-panel.tsx` — five of them carrying a comment saying they
 * matched the others, which is a duplication admitting itself rather than
 * being fixed. A page that passes its own `t` down to a render helper imports
 * this; nothing else needs it.
 */
export type Translator = (key: string, values?: Record<string, string | number>) => string
