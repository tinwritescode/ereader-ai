import type { ReactNode } from 'react'
import { BusyDots } from './busy-dots'

/** One thing to do with a book, as a sticker in the notebook: a critter, what it does, and a note. */
export const TILE =
  'tile group flex items-start gap-2.5 text-left text-ink no-underline outline-offset-4 disabled:opacity-60'

/**
 * Tiles one under another, so every critter stands in line and no tile is ever squeezed beside another.
 * The space above leaves room for what pokes out of a critter (a stamp, a hat) clear of what sits above the shelf.
 */
export function TileShelf({ children }: { children: ReactNode }) {
  return <div className="grid max-w-md basis-full gap-y-5 pt-4">{children}</div>
}

/**
 * What a tile shows. [stamp] is a teacher's mark in red pen on the critter, for something finished;
 * [children] go under the note, such as a progress track or a button; [busy] puts dots after the note while work runs.
 */
export function TileFace({
  critter,
  title,
  note,
  stamp,
  busy = false,
  children,
}: {
  critter: ReactNode
  title: string
  note: string
  stamp?: string
  busy?: boolean
  children?: ReactNode
}) {
  return (
    <>
      <span className="relative shrink-0">
        {critter}
        {stamp && (
          <span className="tile-stamp absolute -top-3.5 -left-1 font-hand text-[15px]/4 text-red" aria-hidden="true">
            {stamp}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col pt-1">
        <span className="tile-title self-start text-sm/5 font-semibold">{title}</span>
        <span className="text-[13px]/5 text-muted">
          {note}
          {busy && <BusyDots />}
        </span>
        {children}
      </span>
    </>
  )
}
