import { cn } from '@/lib/cn'

/**
 * A bordered panel on the elevated surface. Layout inside is the caller's
 * business — the reference product's horizontal listing card is a `Card`
 * whose `CardBody` is a flex row.
 */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface',
        className,
      )}
      {...props}
    />
  )
}

/** Top strip of a `Card`, separated by a rule. */
export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-border px-5 py-4',
        className,
      )}
      {...props}
    />
  )
}

/** Padded content region of a `Card`. */
export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />
}
