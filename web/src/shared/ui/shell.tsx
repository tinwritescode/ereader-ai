import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

/** The notebook's left column, and the page beside it. */
export function Shell({ tasksCount, children }: { tasksCount: ReactNode; children: ReactNode }) {
  return (
    <div className="shell">
      <nav className="nav" aria-label="Chính">
        <b className="brand">Sổ đọc</b>
        <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: 'on' }}>
          Thư viện
        </Link>
        <Link to="/tasks" activeProps={{ className: 'on' }}>
          Tác vụ {tasksCount}
        </Link>
        <Link to="/account" activeProps={{ className: 'on' }}>
          Tài khoản
        </Link>
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
