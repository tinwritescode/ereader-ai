import type { Heard } from '~/features/listen/domain/controller'
import { minutesLeft, nextChapterSpot } from '../domain/spot'
import { clearSpot, recordSpot } from './stores'

/** Keeps the reading spot on the sentence being heard, on any page. */
export function recordHeard(heard: Heard): void {
  const { source } = heard
  if (heard.kind === 'sentence') {
    recordSpot({
      bookId: source.bookId,
      spot: {
        chapterId: source.chapterId,
        chapterLabel: source.chapterLabel,
        minutesLeft: minutesLeft({ minutes: source.option.minutes, read: heard.done }),
        option: source.option,
        block: heard.sentence.block,
        offset: heard.sentence.start,
        quote: heard.sentence.text,
        listened: true,
      },
    })
    return
  }
  if (!source.next) return clearSpot(source.bookId)
  recordSpot({ bookId: source.bookId, spot: nextChapterSpot({ ...source.next, listened: true }) })
}
