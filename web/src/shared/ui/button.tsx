import type { ButtonHTMLAttributes } from 'react'
import { BusyDots } from './busy-dots'

/** [busy] holds the button while its work runs, and says so with dots after the label. */
export function Button({
  quiet = false,
  busy = false,
  className = '',
  disabled = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { quiet?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      className={`${quiet ? 'ink-link' : 'primary'} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {children}
      {busy && <BusyDots />}
    </button>
  )
}
