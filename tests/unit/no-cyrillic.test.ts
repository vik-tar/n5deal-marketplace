import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No Cyrillic anywhere in the shipped source, the message catalogues or the
 * README.
 *
 * The project's second locale is Spanish. It was Russian first, and the switch
 * touched more than `messages/`: measurements quoted in comments, an example
 * password in a byte-length test, a currency-grouping assertion, the language
 * name handed to the AI explainer. Any of those left behind would be a stale
 * fact rather than a typo — a comment describing a locale the app no longer
 * has reads as true and is not.
 *
 * A character-class check rather than a word list, because the failure mode is
 * a leftover nobody thought to look for. It is cheap, it is exact, and it
 * fails loudly the moment one comes back.
 */

const ROOTS = ['src', 'tests', 'prisma', 'messages']
const EXTRA_FILES = ['README.md']
/** Written as escapes so this file does not itself contain what it forbids. */
const CYRILLIC = /[\u0400-\u04FF\u0500-\u052F]/

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    // The generated Prisma client is not ours to police.
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : filesUnder(path)
    return /\.(ts|tsx|mts|json|css|md|prisma|sql)$/.test(entry.name) ? [path] : []
  })
}

describe('no Cyrillic in the shipped project', () => {
  const files = [...ROOTS.flatMap(filesUnder), ...EXTRA_FILES]

  it('scans a plausible number of files — a scanner finding none would pass silently', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('finds no Cyrillic character in any of them', () => {
    const offenders = files
      .map((file) => ({ file, lines: readFileSync(file, 'utf8').split('\n') }))
      .flatMap(({ file, lines }) =>
        lines
          .map((line, index) => ({ file, line: index + 1, text: line }))
          .filter((entry) => CYRILLIC.test(entry.text)),
      )
      .map((entry) => `${entry.file}:${entry.line}`)

    expect(offenders).toEqual([])
  })
})
