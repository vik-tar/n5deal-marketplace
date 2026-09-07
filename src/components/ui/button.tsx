import { FOCUS_RING, cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90',
  secondary: 'bg-surface-2 text-ink border border-border hover:bg-surface',
  ghost: 'text-ink-muted hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
}

/**
 * The `Button` skin as a bare class string, for the places that must be a
 * `Link` and still look like a button — a navigation target is an `<a>`, not a
 * `<button>`, and wrapping one in the other is the accessibility bug this
 * avoids. `Button` below is this function plus the element.
 */
export function buttonClassName(
  variant: Variant = 'primary',
  size: Size = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex items-center justify-center rounded-md font-medium transition',
    'disabled:opacity-50 disabled:pointer-events-none',
    FOCUS_RING,
    variants[variant],
    sizes[size],
    className,
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}) {
  return <button className={buttonClassName(variant, size, className)} {...props} />
}

export type ButtonVariant = Variant
