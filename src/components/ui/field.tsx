import { cn } from '@/lib/cn'

/**
 * Label + control + error message for one form input.
 *
 * The control itself is passed as `children` so this works for `input`,
 * `select`, `textarea` and composite widgets alike. Give the control
 * `id={htmlFor}`, the shared `.field-control` skin from `globals.css`, and —
 * when an error can appear — `aria-describedby={fieldErrorId(htmlFor)}` plus
 * `aria-invalid`.
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
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="meta-label">
        {label}
      </label>
      {children}
      {error ? (
        <p id={fieldErrorId(htmlFor)} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** The `id` `Field` gives its error message, for `aria-describedby`. */
export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`
}
