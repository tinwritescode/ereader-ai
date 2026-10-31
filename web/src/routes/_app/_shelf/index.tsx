import { createFileRoute } from '@tanstack/react-router'
import { booksQuery } from '~/features/books/data/books'
import { LibraryPage } from '~/features/books/ui/library-page'
import { WithBooks } from '~/features/books/ui/with-books'
import { ContinueReading, SpotCaption } from '~/features/reading/ui/spots'
import { TaskCaption } from '~/features/tasks/ui/chapter-extras'
import { pageTitle } from '~/shared/ui/page-title'

export const Route = createFileRoute('/_app/_shelf/')({
  head: () => ({ meta: [{ title: pageTitle('Thư viện') }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(booksQuery()),
  component: () => (
    <LibraryPage
      continueReading={<WithBooks>{(books) => <ContinueReading books={books} />}</WithBooks>}
      captionOf={(book) => <TaskCaption bookId={book.bookId} fallback={<SpotCaption book={book} />} />}
    />
  ),
})
