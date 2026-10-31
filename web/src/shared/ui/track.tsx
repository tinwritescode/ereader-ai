/** How far a long job has come: a marker stroke with an ink edge. */
export function Track({ percent, className = '' }: { percent: number; className?: string }) {
  return (
    <span className={`mt-1.75 block h-2 overflow-hidden rounded bg-track ${className}`} aria-hidden="true">
      <i className="block h-2 border-r-2 border-plum bg-butter" style={{ width: `${percent}%` }} />
    </span>
  )
}
