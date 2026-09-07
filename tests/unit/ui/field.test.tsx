import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Field, fieldErrorId } from '@/components/ui/field'

/**
 * `Field` is the one UI primitive whose contract is an *attribute* rather
 * than a rendered string, so these tests parse the markup into tags and
 * assert on attribute values — never on a substring of the HTML, which would
 * pass just as happily on a Tailwind class that merely mentions `invalid`.
 *
 * Rendered with `renderToStaticMarkup` rather than through a DOM testing
 * library: `Field` has no state, no effects and no event handlers, so one
 * static render is the whole component, and this keeps the unit suite free of
 * a jsdom dependency it otherwise does not need. This is the first `.tsx`
 * test in the suite; `vitest.config.mts` was widened to include them.
 */
type Tag = { name: string; attributes: Record<string, string> }

const TAG = /<([a-z][a-z0-9]*)((?:\s+[a-zA-Z][a-zA-Z0-9-]*(?:="[^"]*")?)*)\s*\/?>/g
const ATTRIBUTE = /([a-zA-Z][a-zA-Z0-9-]*)(?:="([^"]*)")?/g

function tags(html: string): Tag[] {
  return [...html.matchAll(TAG)].map(([, name, rawAttributes]) => ({
    name: name as string,
    attributes: Object.fromEntries(
      [...(rawAttributes ?? '').matchAll(ATTRIBUTE)].map(([, key, value]) => [
        key as string,
        value ?? '',
      ]),
    ),
  }))
}

/** The one tag carrying this `id`, or a failure if the markup holds none. */
function tagWithId(html: string, id: string): Tag {
  const found = tags(html).filter((tag) => tag.attributes.id === id)
  expect(found, `exactly one tag with id="${id}"`).toHaveLength(1)
  return found[0] as Tag
}

function render(node: ReactElement): string {
  return renderToStaticMarkup(node)
}

describe('Field', () => {
  it('points the failing control at the error message that explains it', () => {
    const html = render(
      <Field
        label="Asking price"
        htmlFor="askingPrice"
        error="Enter an amount greater than 0."
      >
        <input id="askingPrice" name="askingPrice" type="number" />
      </Field>,
    )

    const control = tagWithId(html, 'askingPrice')
    expect(control.attributes['aria-invalid']).toBe('true')
    expect(control.attributes['aria-describedby']).toBe(fieldErrorId('askingPrice'))

    // The reference resolves: the id it names is on the element holding the
    // error text, not on some other node or nothing at all.
    const message = tagWithId(html, fieldErrorId('askingPrice'))
    expect(message.name).toBe('p')
    expect(message.attributes.role).toBe('alert')
    expect(html).toContain('Enter an amount greater than 0.')
  })

  it('leaves a valid control with neither attribute', () => {
    const html = render(
      <Field label="Asking price" htmlFor="askingPrice">
        <input id="askingPrice" type="number" />
      </Field>,
    )

    const control = tagWithId(html, 'askingPrice')
    expect(control.attributes['aria-invalid']).toBeUndefined()
    // No dangling reference to an error paragraph that is not in the document.
    expect(control.attributes['aria-describedby']).toBeUndefined()
    expect(tags(html).some((tag) => tag.attributes.id === fieldErrorId('askingPrice'))).toBe(false)
  })

  it('finds a control wrapped in a layout element', () => {
    const html = render(
      <Field label="Timeline" htmlFor="timelineMonths" error="Enter 1 to 60 months.">
        <div className="flex">
          <input id="timelineMonths" type="range" />
          <span>12</span>
        </div>
      </Field>,
    )

    const control = tagWithId(html, 'timelineMonths')
    expect(control.name).toBe('input')
    expect(control.attributes['aria-invalid']).toBe('true')
    expect(control.attributes['aria-describedby']).toBe(fieldErrorId('timelineMonths'))
  })

  it('joins the error reference to a description the caller already set', () => {
    const html = render(
      <Field label="Reason" htmlFor="reason" error="Too short.">
        <textarea id="reason" aria-describedby="reason-hint" />
      </Field>,
    )

    expect(tagWithId(html, 'reason').attributes['aria-describedby']).toBe(
      `reason-hint ${fieldErrorId('reason')}`,
    )
  })

  /**
   * `teaserTitle` in `listing-form.tsx` is this shape: a control plus a hint
   * paragraph, so `children` reaches `Field` as an *array*. The first cut of
   * this component handled only the single-element case and silently wired
   * nothing here — a gap the unit test missed and the browser caught, which
   * is why the control's own attributes are asserted alongside the hint's
   * absence of them.
   */
  it('wires the control and touches nothing beside it', () => {
    const html = render(
      <Field label="Teaser title" htmlFor="teaserTitle" error="Enter 10 to 120 characters.">
        <input id="teaserTitle" type="text" />
        <p id="teaserTitleHint">Keep it anonymous.</p>
      </Field>,
    )

    const control = tagWithId(html, 'teaserTitle')
    expect(control.attributes['aria-invalid']).toBe('true')
    expect(control.attributes['aria-describedby']).toBe(fieldErrorId('teaserTitle'))

    const hint = tagWithId(html, 'teaserTitleHint')
    expect(hint.attributes['aria-invalid']).toBeUndefined()
    expect(hint.attributes['aria-describedby']).toBeUndefined()
  })

  /**
   * `timelineMonths` in `mandate-form.tsx` is both shapes at once: the control
   * sits inside a layout `div` *and* has a sibling `<label>` after it, so the
   * walk has to flatten an array and then descend. Neither case alone proves
   * this one.
   */
  it('finds a nested control that also has a sibling', () => {
    const html = render(
      <Field label="Timeline" htmlFor="timelineMonths" error="Enter 1 to 60 months.">
        <div className="flex">
          <input id="timelineMonths" type="range" />
          <span>12 months</span>
        </div>
        <label>
          <input type="checkbox" />
          No preference
        </label>
      </Field>,
    )

    const control = tagWithId(html, 'timelineMonths')
    expect(control.attributes['aria-invalid']).toBe('true')
    expect(control.attributes['aria-describedby']).toBe(fieldErrorId('timelineMonths'))
  })

  it('finds a control inside a fragment', () => {
    const html = render(
      <Field label="Reason" htmlFor="reason" error="Too short.">
        <>
          <textarea id="reason" />
          <p>Hint</p>
        </>
      </Field>,
    )

    expect(tagWithId(html, 'reason').attributes['aria-invalid']).toBe('true')
  })

  it('renders a composite widget unchanged when no child carries the id', () => {
    const html = render(
      <Field label="Categories" htmlFor="categories" error="Pick at least one.">
        <button type="button">Banking</button>
      </Field>,
    )

    const chip = tags(html).find((tag) => tag.name === 'button') as Tag
    expect(chip.attributes['aria-invalid']).toBeUndefined()
    // The message is still rendered and still announced — only the
    // association is missing, which is what it was before this component
    // owned one.
    expect(tagWithId(html, fieldErrorId('categories')).attributes.role).toBe('alert')
  })
})
