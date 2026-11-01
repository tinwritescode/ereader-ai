import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { isUnseen } from '../domain/release'
import { changelogQuery } from '../data/changelog'
import { seenRelease } from './seen'

/** Có gì mới, with the newest version written beside it and marked until read. */
export function ChangelogLink() {
  const newest = useQuery(changelogQuery()).data?.[0]?.version ?? null
  const seen = seenRelease.useValue()
  // A first visit has nothing to catch up on.
  useEffect(() => {
    if (newest !== null && seenRelease.read() === null) seenRelease.write(newest)
  }, [newest])
  const unseen = isUnseen({ newest, seen })
  return (
    <Link className="ink-link inline-flex items-baseline gap-2.5" to="/changes">
      Có gì mới
      {newest !== null && (
        <span className={`hand px-0.5 text-xl font-normal ${unseen ? 'bg-marker text-red' : 'text-muted'}`}>
          {`bản ${newest}`}
        </span>
      )}
    </Link>
  )
}
