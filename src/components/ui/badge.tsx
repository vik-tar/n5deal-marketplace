import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'border-border bg-surface-2 text-ink-muted',
  accent: 'border-accent/40 bg-accent/15 text-accent',
  success: 'border-success/40 bg-success/15 text-success',
  warning: 'border-warning/40 bg-warning/15 text-warning',
  danger: 'border-danger/40 bg-danger/15 text-danger',
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-[0.6875rem] font-medium tracking-[0.06em] uppercase whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

export type BadgeTone = Tone
