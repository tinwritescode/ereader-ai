export type Book = {
  bookId: string
  title: string
  author: string | null
  /** The book's language, read from its text: "vi", or what the file declares, or "und" when unknown. */
  language: string | null
  hasCover: boolean
  chapterCount: number
  minutes: number
}

export type ChapterSummary = {
  chapterId: string
  /** The table-of-contents entry, e.g. "Chương Một". */
  label: string
  /** The heading under the label, when the book has one. */
  subtitle: string | null
  /** Front matter stands before the table of contents begins. */
  kind: 'main' | 'front'
  minutes: number
}

export type TextBlock = { kind: 'heading' | 'paragraph'; text: string }
/** A picture standing before the block at index [before]; the chapter's block count puts it last. */
export type Figure = { before: number; image: string; alt: string | null; width: number; height: number }

/** Not in Vietnamese, so it can be translated. */
export function isForeign({ language }: Pick<Book, 'language'>): boolean {
  return language !== null && !language.toLowerCase().startsWith('vi')
}

/** Many EPUBs set headings in capitals; show them in sentence case. */
export function displayTitle(text: string): string {
  const hasLetters = text.toUpperCase() !== text.toLowerCase()
  if (!hasLetters || text !== text.toUpperCase()) return text
  const lower = text.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

const TITLE_JOINT = /^[\s:.,–—-]+/

/**
 * What a chapter is called, whichever way round the book stores it: some put "Chương Một" over a
 * title, others "Quy luật 1" under "QUY LUẬT 1 ĐỨNG THẲNG".
 */
export function chapterHeading({ label, subtitle }: Pick<ChapterSummary, 'label' | 'subtitle'>): {
  number: string | null
  title: string
} {
  const named = label.trim()
  const under = subtitle?.trim()
  if (!under) return { number: null, title: displayTitle(named) }
  const shortFirst = named.length <= under.length
  const short = shortFirst ? named : under
  const long = shortFirst ? under : named
  if (!long.toLowerCase().startsWith(short.toLowerCase())) return { number: named, title: displayTitle(under) }
  const rest = long.slice(short.length).replace(TITLE_JOINT, '')
  return rest ? { number: short, title: displayTitle(rest) } : { number: null, title: displayTitle(long) }
}

/** The shortest name of a chapter, for "Đọc tiếp Chương Hai". */
export function chapterName(chapter: Pick<ChapterSummary, 'label' | 'subtitle'>): string {
  const { number, title } = chapterHeading(chapter)
  return number ?? title
}
