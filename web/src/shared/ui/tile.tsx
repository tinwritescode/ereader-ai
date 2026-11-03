import type { ReactNode } from 'react'

/** One thing to do with a book, as a sticker in the notebook: a critter, what it does, and a note. */
export const TILE =
  'tile group flex min-h-14 items-start gap-2.5 text-left text-ink no-underline outline-offset-4 disabled:opacity-60'

/** Tiles in even columns, as many as the page has room for, so every critter stands in line. */
export function TileShelf({ children }: { children: ReactNode }) {
  return (
    <div className="grid basis-full grid-cols-[repeat(auto-fill,minmax(min(16.5rem,100%),1fr))] items-start gap-x-6 gap-y-3">
      {children}
    </div>
  )
}

/**
 * What a tile shows. [stamp] is a teacher's mark in red pen on the critter, for something finished;
 * [children] go under the note, such as a progress track or a button.
 */
export function TileFace({
  critter,
  title,
  note,
  stamp,
  children,
}: {
  critter: ReactNode
  title: string
  note: string
  stamp?: string
  children?: ReactNode
}) {
  return (
    <>
      <span className="relative shrink-0">
        {critter}
        {stamp && (
          <span className="tile-stamp absolute -top-2.5 -left-3.5 font-hand text-[15px]/4 text-red" aria-hidden="true">
            {stamp}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col pt-1">
        <span className="tile-title self-start text-sm/5 font-semibold">{title}</span>
        <span className="text-[13px]/5 text-muted">{note}</span>
        {children}
      </span>
    </>
  )
}
