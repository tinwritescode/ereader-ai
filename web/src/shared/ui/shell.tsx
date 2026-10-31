import { Link, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'

/** One sheet of ruled paper. Left of the red line is written by hand: the way around, or the way back. */
export function Shell({ tasksCount, children }: { tasksCount: ReactNode; children: ReactNode }) {
  const inBook = useRouterState({ select: (router) => router.location.pathname.startsWith('/books/') })
  return (
    <div className="shell">
      <nav className="nav" aria-label="Chính">
        {inBook ? (
          <Link to="/">‹ Thư viện</Link>
        ) : (
          <>
            <b className="brand">eReader</b>
            <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: 'on' }}>
              Thư viện
            </Link>
            <Link to="/tasks" activeProps={{ className: 'on' }}>
              {tasksCount} Tác vụ
            </Link>
            <Link to="/account" activeProps={{ className: 'on' }}>
              Tài khoản
            </Link>
          </>
        )}
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
