/** A run of a note's text; marked runs are shown under the marker. */
export type Segment = { text: string; marked: boolean }
/** One line of a release's notes. */
export type Note = Segment[]

/** What one version changed, as written in backend/changelog. */
export type Release = { version: string; date: string; title: string; added: Note[]; fixed: Note[] }

/** The newest version is marked until read; a first visit has nothing to catch up on. */
export function isUnseen({ newest, seen }: { newest: string | null; seen: string | null }): boolean {
  return newest !== null && seen !== null && newest !== seen
}

/** 2026-11-01 as 1 tháng 11, 2026. */
export function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return `${day} tháng ${month}, ${year}`
}
