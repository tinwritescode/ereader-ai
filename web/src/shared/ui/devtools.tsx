import { lazy, Suspense } from 'react'

// Decided at module level so a production build drops the import itself; the panels touch window.
const Panels = import.meta.env.DEV && !import.meta.env.SSR ? lazy(() => import('./devtools-panels')) : null

export function Devtools() {
  if (!Panels) return null
  return (
    <Suspense>
      <Panels />
    </Suspense>
  )
}
