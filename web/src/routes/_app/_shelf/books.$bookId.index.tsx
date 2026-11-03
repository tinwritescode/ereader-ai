import { createFileRoute } from '@tanstack/react-router'
import { WithAccount } from '~/features/account/ui/with-account'
import { booksQuery, chaptersQuery } from '~/features/books/data/books'
import { BookPage } from '~/features/books/ui/book-page'
import { WithVoices } from '~/features/listen/ui/with-voices'
import { ChooseLength } from '~/features/reading/ui/choose-length'
import { ResumeLine, WithStartChapter } from '~/features/reading/ui/spots'
import { ShareBook } from '~/features/sharing/ui/share-book'
import { ChapterMark, WholeBookRows } from '~/features/tasks/ui/whole-book'
import { pageTitle } from '~/shared/ui/page-title'
import { TileShelf } from '~/shared/ui/tile'

export const Route = createFileRoute('/_app/_shelf/books/$bookId/')({
  loader: async ({ context, params }) => {
    const [books] = await Promise.all([
      context.queryClient.ensureQueryData(booksQuery()),
      context.queryClient.ensureQueryData(chaptersQuery(params.bookId)),
    ])
    return { bookTitle: books.find(({ bookId }) => bookId === params.bookId)?.title ?? '' }
  },
  head: ({ loaderData }) => ({ meta: [{ title: pageTitle(loaderData?.bookTitle ?? '') }] }),
  component: BookRoute,
})

function BookRoute() {
  const { bookId } = Route.useParams()
  return (
    <WithStartChapter bookId={bookId}>
      {(current) => (
        <BookPage
          bookId={bookId}
          currentId={current?.chapterId ?? null}
          chooseLength={(choice) => <ChooseLength {...choice} />}
          resume={(book, chapters) => <ResumeLine book={book} chapters={chapters} />}
          markOf={(book, chapter, fallback) => (
            <ChapterMark bookId={book.bookId} chapterId={chapter.chapterId} fallback={fallback} />
          )}
          aside={(book) => (
            <TileShelf>
              <WithAccount>
                {(account) => (
                  <WithVoices>
                    {(voices) => <WholeBookRows book={book} account={account} start={current} voices={voices} />}
                  </WithVoices>
                )}
              </WithAccount>
              <ShareBook bookId={book.bookId} />
            </TileShelf>
          )}
        />
      )}
    </WithStartChapter>
  )
}
