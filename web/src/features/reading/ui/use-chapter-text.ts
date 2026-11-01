import { useQuery } from '@tanstack/react-query'
import { codeOf } from '~/features/books/domain/words'
import { originalQuery, shortenedQuery, translatedQuery } from '../data/text'
import type { ChapterText } from '../domain/chapter-text'
import type { LengthOption } from '../domain/length'

const TRANSLATION_POLL_MS = 4000

export function useChapterText({ chapterId, option }: { chapterId: string; option: LengthOption }): ChapterText {
  const { length, minutes } = option
  const shortened = length === 'shortened' || length === 'keyPoints'
  const original = useQuery({ ...originalQuery(chapterId), enabled: length !== 'shortened' && length !== 'keyPoints' })
  const translated = useQuery({
    ...translatedQuery(chapterId),
    enabled: length === 'vietnamese',
    refetchInterval: (query) =>
      query.state.error && codeOf(query.state.error) === 'TRANSLATION_NOT_READY' ? TRANSLATION_POLL_MS : false,
  })
  const digest = useQuery({ ...shortenedQuery({ chapterId, minutes }), enabled: shortened })

  const made = shortened ? digest : length === 'vietnamese' ? translated : original
  const blocks = shortened ? digest.data : length === 'vietnamese' ? translated.data : original.data?.blocks
  // A digest is written anew, so the book's pictures have no place in it.
  if (blocks) return { kind: 'loaded', blocks, figures: shortened ? [] : (original.data?.figures ?? []) }
  if (made.error) {
    const code = codeOf(made.error)
    if (code === 'TRANSLATION_NOT_READY') {
      return original.data ? { kind: 'untranslated', ...original.data } : { kind: 'loading', shortening: false }
    }
    return { kind: 'failed', code, retry: () => void made.refetch() }
  }
  return { kind: 'loading', shortening: shortened }
}
