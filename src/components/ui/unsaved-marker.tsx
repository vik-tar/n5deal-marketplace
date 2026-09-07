/**
 * "You have edits here that are not saved."
 *
 * Attached to its form's save button through `aria-describedby` rather than
 * announced as a live region: it toggles on a keystroke, and a `role="status"`
 * firing on every character is noise a screen-reader user cannot use. Described
 * this way, focusing the button reads "Save draft, unsaved changes", which is
 * the moment the information is worth having.
 *
 * Shared by every form that can lose work — the buyer's profile and mandate
 * (`@/components/domain/mandate-form`) and the seller's listing editor
 * (`@/components/domain/listing-form`). One definition so the dot, the colour
 * and the wiring cannot drift between them.
 */
export function UnsavedMarker({ id, label }: { id: string; label: string }) {
  return (
    <span id={id} className="inline-flex items-center gap-1.5 text-xs text-warning">
      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-warning" />
      {label}
    </span>
  )
}
