import { createFileRoute } from '@tanstack/react-router'
import { booksQuery, chaptersQuery } from '~/features/books/data/books'
import { WithBook } from '~/features/books/ui/with-book'
import { originalQuery } from '~/features/reading/data/text'
import { ReaderSearch } from '~/features/reading/domain/length'
import { ReaderPage } from '~/features/reading/ui/reader-page'

export const Route = createFileRoute('/_app/books/$bookId/chapters/$chapterId')({
  validateSearch: ReaderSearch,
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(booksQuery()),
      context.queryClient.ensureQueryData(chaptersQuery(params.bookId)),
      context.queryClient.ensureQueryData(originalQuery(params.chapterId)),
    ]),
  component: function View() {
    const { bookId, chapterId } = Route.useParams()
    return <WithBook bookId={bookId}>{(shelf) => <ReaderPage {...shelf} chapterId={chapterId} search={Route.useSearch()} />}</WithBook>
  },
})
