import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { dateLabel } from '../domain/release'
import type { Note, Release } from '../domain/release'
import { changelogQuery } from '../data/changelog'
import { seenRelease } from './seen'

function NoteLine({ note, isNew }: { note: Note; isNew: boolean }) {
  return (
    <li
      className={`relative mt-1.5 pl-3.5 text-[15px]/[23px] before:absolute before:top-2.5 before:left-0 before:size-[5px] before:rounded-full before:content-[''] ${isNew ? 'before:bg-ink' : 'before:bg-muted'}`}
    >
      {note.map(({ text, marked }, index) =>
        marked ? (
          <mark
            key={index}
            className="bg-[linear-gradient(transparent_52%,var(--color-marker)_52%)] px-px text-inherit"
          >
            {text}
          </mark>
        ) : (
          <span key={index}>{text}</span>
        ),
      )}
    </li>
  )
}

function Group({ name, notes, isNew }: { name: string; notes: Note[]; isNew: boolean }) {
  if (notes.length === 0) return null
  return (
    <>
      <h3 className="hand mt-2.5 text-[19px]/6 text-red">{name}</h3>
      <ul className="list-none p-0">
        {notes.map((note, index) => (
          <NoteLine key={index} note={note} isNew={isNew} />
        ))}
      </ul>
    </>
  )
}

function Entry({ release, open, onOpen }: { release: Release; open: boolean; onOpen: () => void }) {
  const count = release.added.length + release.fixed.length
  return (
    <section className="relative max-w-140 border-b border-rule pt-4.5 pb-4 last:border-b-0">
      {/* Written across the margin line, as a page number in a notebook. */}
      <span
        className={`hand absolute top-3.5 right-full mr-[calc(var(--gap)-12px)] -rotate-6 bg-paper px-0.5 text-[22px]/7 ${open ? 'text-red' : 'text-muted'}`}
      >
        {release.version}
      </span>
      <p className="text-[12.5px] text-muted">{dateLabel(release.date)}</p>
      <h2 className="text-lg font-semibold text-ink">{release.title}</h2>
      {open ? (
        <>
          <Group name="Mới" notes={release.added} isNew />
          <Group name="Sửa" notes={release.fixed} isNew={false} />
        </>
      ) : (
        <button type="button" className="ink-link" onClick={onOpen}>
          {`Xem ${count} thay đổi`}
        </button>
      )}
    </section>
  )
}

/** Every version, newest first; opening it counts as having read the newest. */
export function ChangelogPage() {
  const { data: releases } = useSuspenseQuery(changelogQuery())
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const newest = releases[0]?.version ?? null
  useEffect(() => {
    if (newest !== null) seenRelease.write(newest)
  }, [newest])
  return (
    <>
      <h1>Có gì mới</h1>
      {releases.map((release, index) => (
        <Entry
          key={release.version}
          release={release}
          open={index === 0 || opened.has(release.version)}
          onOpen={() => setOpened(new Set([...opened, release.version]))}
        />
      ))}
    </>
  )
}
