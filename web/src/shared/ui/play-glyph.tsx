/** Drawn, not typed: a font's ▶ sits wherever that font puts it. The triangle's centroid is the middle. */
export function PlayGlyph({ playing = false }: { playing?: boolean }) {
  return (
    <svg className="block size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={playing ? 'M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z' : 'M8.5 5.5v13L19 12z'} />
    </svg>
  )
}
