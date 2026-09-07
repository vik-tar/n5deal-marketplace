import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'

/**
 * Label + control + error message for one form input.
 *
 * The control itself is passed as `children` so this works for `input`,
 * `select`, `textarea` and composite widgets alike. Give the control
 * `id={htmlFor}` and the shared `.field-control` skin from `globals.css`;
 * the accessibility wiring is this component's job, not the caller's.
 *
 * **`Field` associates the error with the control itself** — it finds the
 * descendant carrying `id={htmlFor}` and clones it with `aria-invalid` and an
 * `aria-describedby` pointing at the error paragraph. Until the branch
 * review's third fix round this component only *documented* that the caller
 * should pass those two attributes, and across roughly thirty call sites not
 * one ever did: the error text was rendered and announced, but never tied to
 * the input that had been rejected, so a screen-reader user heard the label
 * and the control and never learned why their submission failed. Thirty
 * correct call sites would only have been correct until the thirty-first, so
 * the association is owned here, where it cannot be forgotten.
 *
 * The control is identified by `id === htmlFor` because that invariant is
 * already load-bearing: the `<label htmlFor>` below points at the same id, so
 * a `Field` whose child does not carry it is already broken in a way that
 * shows up in the same audit. Two alternatives were rejected — a render prop
 * (`children: (controlProps) => …`) and a context plus a `useFieldControl()`
 * hook — because both put the spread back in the caller's hands and so
 * restore exactly the failure mode this fixes.
 *
 * The walk recurses through plain host elements and fragments (the `priceMin`
 * field in `filter-sidebar.tsx` and the timeline slider in `mandate-form.tsx`
 * both wrap their control in a layout `div`; `teaserTitle` in
 * `listing-form.tsx` puts a hint paragraph beside its input, so `children` is
 * an array) but stops at any component boundary, whose children this component
 * does not render and must not rewrite. Nothing found means nothing changed:
 * `Field` never throws over its own children.
 */
export function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string
  htmlFor: string
  error?: string | undefined
  className?: string
  children: React.ReactNode
}) {
  const errorId = error ? fieldErrorId(htmlFor) : null
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="meta-label">
        {label}
      </label>
      {describeChildren(children, htmlFor, errorId)}
      {error ? (
        <p id={fieldErrorId(htmlFor)} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The `id` `Field` gives its error message.
 *
 * Callers no longer need this — `Field` does the referencing itself — but it
 * stays exported so `tests/unit/ui/field.test.tsx` asserts against the same
 * function the component renders rather than a re-typed literal.
 */
export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`
}

/**
 * Adds `extra` to a space-separated id list, preserving whatever the caller
 * already put there — `moderation-dialog.tsx` describes its reason box with
 * its own hint paragraph, and an error must join that reference rather than
 * replace it. `null` when there is nothing to point at, so a field with no
 * error emits no `aria-describedby` at all: an id reference to an element
 * that is not in the document is a dangling reference, not a harmless one.
 */
function mergeIds(existing: unknown, extra: string | null): string | undefined {
  const ids = typeof existing === 'string' ? existing.split(/\s+/).filter(Boolean) : []
  if (extra !== null && !ids.includes(extra)) ids.push(extra)
  return ids.length > 0 ? ids.join(' ') : undefined
}

/**
 * Returns `children` with the control (`id === htmlFor`) carrying the error
 * association, and everything else untouched.
 */
function describeChildren(
  children: ReactNode,
  htmlFor: string,
  errorId: string | null,
): ReactNode {
  // Through `Children.map`, not a bare call: `children` is a single element
  // for most fields and an array whenever a caller puts a hint beside its
  // control (`teaserTitle` in `listing-form.tsx`), and an array is not a
  // valid element — handling only the single-element case silently skipped
  // every field that had a sibling, which is how this shipped in the first
  // place. `Children.map` flattens both shapes and keys the result.
  return Children.map(children, (child) => describeControl(child, htmlFor, errorId))
}

/**
 * One node: the control if this is it, otherwise a descent through anything
 * whose children are ours to rewrite.
 *
 * `aria-invalid` is set only while `errorId` is non-null — an input that is
 * permanently `aria-invalid="false"` is noise, and one that is permanently
 * `"true"` is a lie. A caller that set the attribute itself keeps its value
 * when there is no error; there is no such caller today.
 */
function describeControl(node: ReactNode, htmlFor: string, errorId: string | null): ReactNode {
  if (!isValidElement(node)) return node
  const element = node as ReactElement<Record<string, unknown>>
  const props = element.props

  if (props.id === htmlFor) {
    return cloneElement(element, {
      'aria-invalid': errorId === null ? props['aria-invalid'] : true,
      'aria-describedby': mergeIds(props['aria-describedby'], errorId),
    })
  }

  // Only a host element's (or a fragment's) children are ours to rewrite: a
  // component's `children` prop is an input to that component, which may
  // place it anywhere or nowhere, so cloning through one would be guesswork.
  if (typeof element.type !== 'string' && element.type !== Fragment) return node
  const children = props.children
  if (children === undefined || children === null) return node

  return cloneElement(
    element,
    undefined,
    describeChildren(children as ReactNode, htmlFor, errorId),
  )
}
