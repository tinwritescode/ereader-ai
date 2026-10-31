import { useQuery } from '@tanstack/react-query'
import type { TextBlock } from '~/features/books/domain/book'
import { codeOf } from '~/features/books/domain/words'
import { originalQuery, shortenedQuery, translatedQuery } from '../data/text'
import type { LengthOption } from '../domain/length'

const TRANSLATION_POLL_MS = 4000

export type ChapterText =
  | { kind: 'loading'; shortening: boolean }
  | { kind: 'loaded'; blocks: TextBlock[] }
  /** The translation is not made yet; the original stands in, faded, until it is. */
  | { kind: 'untranslated'; blocks: TextBlock[] }
  | { kind: 'failed'; code: string; retry: () => void }

export function useChapterText({ chapterId, option }: { chapterId: string; option: LengthOption }): ChapterText {
  const { length, minutes } = option
  const shortened = length === 'shortened' || length === 'keyPoints'
  const original = useQuery({ ...originalQuery(chapterId), enabled: length !== 'shortened' && length !== 'keyPoints' })
  const translated = useQuery({
    ...translatedQuery(chapterId),
    enabled: length === 'vietnamese',
    refetchInterval: (query) => (query.state.error && codeOf(query.state.error) === 'TRANSLATION_NOT_READY' ? TRANSLATION_POLL_MS : false),
  })
  const digest = useQuery({ ...shortenedQuery({ chapterId, minutes }), enabled: shortened })

  const made = shortened ? digest : length === 'vietnamese' ? translated : original
  if (made.data) return { kind: 'loaded', blocks: made.data }
  if (made.error) {
    const code = codeOf(made.error)
    if (code === 'TRANSLATION_NOT_READY') {
      return original.data ? { kind: 'untranslated', blocks: original.data } : { kind: 'loading', shortening: false }
    }
    return { kind: 'failed', code, retry: () => void made.refetch() }
  }
  return { kind: 'loading', shortening: shortened }
}
