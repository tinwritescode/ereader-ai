import { createFileRoute } from '@tanstack/react-router'
import { WithAccount } from '~/features/account/ui/with-account'
import { booksQuery, chaptersQuery } from '~/features/books/data/books'
import { BookPage } from '~/features/books/ui/book-page'
import { WithVoices } from '~/features/listen/ui/with-voices'
import { ChooseLength } from '~/features/reading/ui/choose-length'
import { ResumeLine, WithStartChapter } from '~/features/reading/ui/spots'
import { ChapterMark, WholeBookRows } from '~/features/tasks/ui/whole-book'

export const Route = createFileRoute('/_app/_shelf/books/$bookId/')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(booksQuery()),
      context.queryClient.ensureQueryData(chaptersQuery(params.bookId)),
    ]),
  component: () => (
    <BookPage
      bookId={Route.useParams().bookId}
      chooseLength={(choice) => <ChooseLength {...choice} />}
      resume={(book, chapters) => <ResumeLine book={book} chapters={chapters} />}
      markOf={(book, chapter, fallback) => (
        <ChapterMark bookId={book.bookId} chapterId={chapter.chapterId} fallback={fallback} />
      )}
      aside={(book) => (
        <WithAccount>
          {(account) => (
            <WithStartChapter bookId={book.bookId}>
              {(start) => (
                <WithVoices>
                  {(voices) => <WholeBookRows book={book} account={account} start={start} voices={voices} />}
                </WithVoices>
              )}
            </WithStartChapter>
          )}
        </WithAccount>
      )}
    />
  ),
})
