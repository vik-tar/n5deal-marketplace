import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import ru from '../../messages/ru.json'
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

const catalogues: Record<string, Catalogue> = { en, ru }

describe('message catalogues', () => {
  it('covers every configured locale', () => {
    expect(Object.keys(catalogues).sort()).toEqual([...routing.locales].sort())
  })

  it('has identical key structure across locales', () => {
    expect(keyPaths(ru)).toEqual(keyPaths(en))
  })

  it('has no empty strings', () => {
    for (const [locale, catalogue] of Object.entries(catalogues)) {
      for (const [key, value] of leafValues(catalogue)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('')
      }
    }
  })

  it('translates Russian copy rather than leaving English placeholders', () => {
    // Proper nouns, language endonyms, and untranslated financial acronyms
    // are legitimately identical — Russian financial writing keeps "EBITDA"
    // in Latin script rather than transliterating or translating it.
    const sharedByDesign = new Set([
      'common.appName',
      'localeSwitcher.locale.en',
      'localeSwitcher.locale.ru',
      'gate.open.ebitda',
      'listingForm.fields.ebitdaLabel',
      'listingForm.fields.dataRoomUrlPlaceholder',
      // A URL example, not language-specific — same reasoning as
      // `listingForm.fields.dataRoomUrlPlaceholder` above.
      'profile.profileSection.fields.websiteUrlPlaceholder',
      // Regulatory licence-type acronyms: Russian fintech/legal writing keeps
      // these in Latin script too, the same reasoning as the `ebitda` entries
      // above. `profile.licenceType.Banking` is the one member of this fixed
      // universe that is an ordinary English word, not an acronym, and it is
      // translated ("Банковская лицензия") rather than exempted here.
      'profile.licenceType.PI',
      'profile.licenceType.EMI',
      'profile.licenceType.SEMI',
      'profile.licenceType.MSO',
      'profile.licenceType.API',
      'profile.licenceType.CASP',
      // Pure template-and-punctuation strings with no language-specific word
      // in them at all — "{min} – {max}" and "{score}/100" render the same
      // en-dash range notation and "/100" score suffix in Russian
      // typography as in English, the same reasoning as the URL-example
      // entries above.
      'buyers.card.ticketRange',
      'matchBadge.scoreValue',
    ])
    const identical = keyPaths(en).filter((path) => {
      if (sharedByDesign.has(path)) return false
      const read = (c: Catalogue) =>
        path
          .split('.')
          .reduce<string | Catalogue>((acc, part) => (acc as Catalogue)[part]!, c)
      return read(en) === read(ru)
    })
    expect(identical).toEqual([])
  })
})
