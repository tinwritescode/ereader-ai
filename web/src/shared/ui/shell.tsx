import { Link, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Garland, NoelSwitch } from './noel'

const WAY =
  'pen-line leading-11 text-muted no-underline transition-colors hover:text-ink aria-checked:text-red data-[status=active]:text-red md:ml-auto md:block md:w-fit md:leading-14'

/** One sheet of ruled paper. Left of the red line is written by hand: the way around, or the way back. */
export function Shell({ tasksCount, children }: { tasksCount: ReactNode; children: ReactNode }) {
  const inBook = useRouterState({ select: (router) => router.location.pathname.startsWith('/books/') })
  return (
    <div className="relative min-h-dvh before:absolute before:inset-y-0 before:left-(--m) before:w-[1.5px] before:origin-top before:animate-draw-down before:bg-red before:opacity-75 before:content-['']">
      <Garland />
      <nav
        className="sticky top-0 z-15 ml-[calc(var(--m)+var(--gap))] flex justify-end gap-3.5 bg-paper pr-4 font-hand text-[18px] md:fixed md:left-0 md:m-0 md:block md:w-(--m) md:bg-transparent md:pt-line md:pr-3.5 md:pl-4.5 md:text-right md:text-[21px]/7"
        aria-label="Chính"
      >
        {inBook ? (
          <Link className={WAY} to="/" viewTransition>
            ‹ Thư viện
          </Link>
        ) : (
          <>
            <b className="hidden text-[30px]/14 font-normal text-ink md:block">eReader</b>
            <Link className={WAY} to="/" activeOptions={{ exact: true }}>
              Thư viện
            </Link>
            <Link className={WAY} to="/tasks">
              {tasksCount} Tác vụ
            </Link>
            <Link className={WAY} to="/account">
              Tài khoản
            </Link>
          </>
        )}
        {/* Beside a phone's row, in the margin, where it has room to be pressed. */}
        <span className="absolute top-0 right-[calc(100%+var(--gap))] grid w-(--m) place-items-center bg-paper md:static md:block md:w-auto md:bg-transparent">
          <NoelSwitch className={`${WAY} min-w-11 md:min-w-0`} />
        </span>
      </nav>
      <main className="relative ml-(--m) max-w-280 pr-(--pad) pb-28 pl-(--gap) md:pt-line">{children}</main>
    </div>
  )
}
