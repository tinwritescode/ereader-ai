import '@tanstack/react-start/server-only'
import { clearTokens } from './session'

export function clearSession(): void {
  clearTokens()
}
