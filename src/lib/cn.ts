/** Shared class-name plumbing for the design system. Pure — no DB, no fetch, no env. */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * The one focus ring in the product: 2px solid accent, 2px offset, keyboard
 * only. Every interactive element must carry it — put it in the `cn()` call
 * alongside the element's own classes.
 *
 * The `.field-control:focus-visible` rule in `src/app/globals.css` hand-copies
 * this because CSS cannot import a TypeScript constant; change both together.
 */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
