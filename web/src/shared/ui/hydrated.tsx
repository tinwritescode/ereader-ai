import { useEffect } from 'react'

/** Tells browser tests the page responds; Redact leaves no React fiber keys to look for. */
export function Hydrated() {
  useEffect(() => {
    document.documentElement.dataset['appReady'] = 'true'
  }, [])
  return null
}
