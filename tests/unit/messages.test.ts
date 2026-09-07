import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import { routing } from '@/i18n/routing'

type Catalogue = { [key: string]: string | Catalogue }

/** Every leaf key, dot-joined, sorted — the catalogue's shape without its copy. */
function keyPaths(node: Catalogue, prefix = ''): string[] {
  return Object.entries(node)
    .flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key
      return typeof value === 'string' ? [path] : keyPaths(value, path)
    })
    .sort()
}

/** Every leaf value, in key order. */
function leafValues(node: Catalogue): Array<[string, string]> {
  return Object.entries(node)
    .flatMap<[string, string]>(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : leafValues(value),
    )
    .sort()
}

const catalogues: Record<string, Catalogue> = { en, es }

describe('message catalogues', () => {
  it('covers every configured locale', () => {
    expect(Object.keys(catalogues).sort()).toEqual([...routing.locales].sort())
  })

  it('has identical key structure across locales', () => {
    expect(keyPaths(es)).toEqual(keyPaths(en))
  })

  it('has no empty strings', () => {
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      for (const [key, value] of leafValues(catalogue)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('')
      }
    }
  })

  it('translates the second locale rather than leaving English placeholders', () => {
    // Proper nouns, language endonyms, and untranslated financial acronyms
    // are legitimately identical — Spanish financial writing keeps "EBITDA"
    // and "data room" as they are rather than translating them.
    const sharedByDesign = new Set([
      'common.appName',
      'localeSwitcher.locale.en',
      'localeSwitcher.locale.es',
      'gate.open.ebitda',
      'listingForm.fields.ebitdaLabel',
      'listingForm.fields.dataRoomUrlPlaceholder',
      // A URL example, not language-specific — same reasoning as
      // `listingForm.fields.dataRoomUrlPlaceholder` above.
      'profile.profileSection.fields.websiteUrlPlaceholder',
      // Regulatory licence-type acronyms: Spanish fintech and legal writing
      // keeps these unchanged too, the same reasoning as the `ebitda` entries
      // above. `profile.licenceType.Banking` is the one member of this fixed
      // universe that is an ordinary English word, not an acronym, and it is
      // translated ("Licencia bancaria") rather than exempted here.
      'profile.licenceType.PI',
      'profile.licenceType.EMI',
      'profile.licenceType.SEMI',
      'profile.licenceType.MSO',
      'profile.licenceType.API',
      'profile.licenceType.CASP',
      // Pure template-and-punctuation strings with no language-specific word
      // in them at all — "{min} – {max}" and "{score}/100" render the same
      // en-dash range notation and "/100" score suffix in Spanish typography
      // as in English, the same reasoning as the URL-example entries above.
      'buyers.card.ticketRange',
      'matchBadge.scoreValue',
      // English terms Spanish business writing uses unchanged, the same
      // reasoning as the acronyms above: "fintech" is the ordinary word in
      // Spanish, a "data room" is called a data room, and a family office is
      // a family office. Translating any of them would read as a coinage.
      'assets.category.FINTECH',
      'gate.open.dataRoomLabel',
      'profile.buyerType.FAMILY_OFFICE',
    ])
    const identical = keyPaths(en).filter((path) => {
      if (sharedByDesign.has(path)) return false
      const read = (c: Catalogue) =>
        path
          .split('.')
          .reduce<string | Catalogue>((acc, part) => (acc as Catalogue)[part]!, c)
      return read(en) === read(es)
    })
    expect(identical).toEqual([])
  })
})
