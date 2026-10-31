import type { ButtonHTMLAttributes } from 'react'

export function Button({
  quiet = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { quiet?: boolean }) {
  return <button type="button" className={`${quiet ? 'ink-link' : 'primary'} ${className}`} {...props} />
}
