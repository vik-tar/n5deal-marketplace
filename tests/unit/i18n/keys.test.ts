import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../../../messages/en.json'

/**
 * Every translation key written as a literal in `src/` must exist in the
 * catalogue, under the namespace the variable it is called on was bound to.
 *
 * This closes a gap nothing else in the suite could see. `tsc` cannot help:
 * `Translator` (`@/i18n/translator`) is deliberately typed `(key: string)`,
 * because this project does not generate a key union per namespace, so a
 * mistyped key is a well-typed `string`. `messages.test.ts` checks the
 * catalogue against *itself* — parity between locales, no empty values — which
 * says nothing about whether the code asks for keys that are in it. The result
 * was a `MISSING_MESSAGE` thrown at render time on the buyer dashboard, a page
 * every buyer with a mandate sees, found by clicking rather than by a test:
 * `tBuyers('card.specificity')` where the key is `buyers.specificity`. The
 * `card.` prefix was correct for the line above it (`card.ticketLabel` really
 * is nested) and wrong for that one.
 *
 * **Attribution is per variable, not per file.** `admin-asset-table.tsx` binds
 * both `admin.assets` and `assets`, and calls `t('empty')` on the first;
 * `admin.assets.empty` is a string while `assets.empty` is a group of three.
 * Checking a key against every namespace a file binds would call that a
 * failure. Checking it against the namespace of the binding it is actually
 * called on is both correct and stricter — a key that exists in the file's
 * *other* namespace no longer passes.
 *
 * **It is deliberately incomplete, in the safe direction.** Only literal
 * single-quoted keys are checked; a template literal (`t(\`category.${x}\`)`)
 * is skipped, because its key is not known until runtime. Those are covered by
 * the enums they are built from and by `messages.test.ts`'s parity check. This
 * proves no missing key exists among the literals, never that none exists at
 * all.
 */

const SOURCE_ROOT = 'src'

/** `const t = useTranslations('x')`, and the awaited server-side form. */
const DIRECT_BINDING =
  /const\s+(\w+)\s*=\s*(?:await\s+)?(?:use|get)Translations\(\s*(?:'([^']*)')?\s*\)/g

/**
 * `const [a, t, tProfile] = await Promise.all([...])` — the shape most pages
 * here use to load a viewer and several namespaces in one round trip. Without
 * this, a third of the call sites would be silently unattributed.
 */
const DESTRUCTURED_BINDING = /const\s*\[([^\]]*)\]\s*=\s*await\s+Promise\.all\(\[([\s\S]*?)\]\)/g

/** One element of that array, when it is a translator. */
const TRANSLATOR_ELEMENT = /^(?:await\s+)?(?:use|get)Translations\(\s*(?:'([^']*)')?\s*\)$/

/**
 * A call on a translator binding. Restricted to `t` and `t` + an upper-case
 * letter so it cannot match `test(`, `toEqual(` or any other ordinary function
 * whose name starts with a `t`.
 */
const LITERAL_CALL = /\b(t|t[A-Z]\w*)\(\s*'([^']+)'/g

/** Splits on commas that are not inside brackets, parentheses or braces. */
function splitTopLevel(source: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of source) {
    if ('([{'.includes(char)) depth += 1
    if (')]}'.includes(char)) depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map((part) => part.trim())
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    // The generated Prisma client is not ours and holds no translations.
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** Variable name -> namespace it was bound to (`''` is the whole catalogue). */
function bindingsIn(source: string): Map<string, string> {
  const bindings = new Map<string, string>()

  for (const match of source.matchAll(DIRECT_BINDING)) {
    bindings.set(match[1], match[2] ?? '')
  }

  for (const match of source.matchAll(DESTRUCTURED_BINDING)) {
    const names = splitTopLevel(match[1])
    const values = splitTopLevel(match[2])
    names.forEach((name, index) => {
      const value = values[index]
      if (value === undefined) return
      const translator = TRANSLATOR_ELEMENT.exec(value)
      if (translator) bindings.set(name, translator[1] ?? '')
    })
  }

  return bindings
}

function resolveKey(path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      en,
    )
}

interface Usage {
  file: string
  variable: string
  key: string
  /** `undefined` when no binding for `variable` was found in the file. */
  namespace: string | undefined
}

function collectUsages(): Usage[] {
  const usages: Usage[] = []
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const source = readFileSync(file, 'utf8')
    const bindings = bindingsIn(source)
    for (const match of source.matchAll(LITERAL_CALL)) {
      usages.push({
        file,
        variable: match[1],
        key: match[2],
        namespace: bindings.get(match[1]),
      })
    }
  }
  return usages
}

describe('translation keys used in source', () => {
  const usages = collectUsages()

  /**
   * A scanner that quietly stops matching would turn every assertion below
   * into a tautology, which is the failure mode a test like this actually has.
   */
  it('finds the call sites at all', () => {
    expect(usages.length).toBeGreaterThan(300)
    expect(new Set(usages.map((usage) => usage.file)).size).toBeGreaterThan(30)
  })

  it('attributes every call to a namespace', () => {
    const unattributed = usages
      .filter((usage) => usage.namespace === undefined)
      .map((usage) => `${usage.file}: ${usage.variable}('${usage.key}')`)

    expect(unattributed).toEqual([])
  })

  it('resolves every key under the namespace of the binding it is called on', () => {
    const missing = usages
      .filter((usage) => usage.namespace !== undefined)
      .filter(
        (usage) =>
          resolveKey(usage.namespace ? `${usage.namespace}.${usage.key}` : usage.key) === undefined,
      )
      .map((usage) => `${usage.file}: ${usage.variable}('${usage.key}') -> ${usage.namespace}.${usage.key}`)

    expect(missing).toEqual([])
  })

  it('resolves every key to a string, never to a group of keys', () => {
    // `t('card')` where `card` is a group renders `[object Object]` rather than
    // throwing, so it would survive the check above.
    const notLeaves = usages
      .filter((usage) => usage.namespace !== undefined)
      .map((usage) => ({
        usage,
        value: resolveKey(usage.namespace ? `${usage.namespace}.${usage.key}` : usage.key),
      }))
      .filter((result) => result.value !== undefined && typeof result.value !== 'string')
      .map((result) => `${result.usage.file}: ${result.usage.key}`)

    expect(notLeaves).toEqual([])
  })
})
