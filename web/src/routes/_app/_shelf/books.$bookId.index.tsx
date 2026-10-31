import { createFileRoute } from '@tanstack/react-router'
import { booksQuery, chaptersQuery } from '~/features/books/data/books'
import { BookPage } from '~/features/books/ui/book-page'
import { ChooseLength } from '~/features/reading/ui/choose-length'

export const Route = createFileRoute('/_app/_shelf/books/$bookId/')({
  loader: ({ context, params }) =>
    Promise.all([context.queryClient.ensureQueryData(booksQuery()), context.queryClient.ensureQueryData(chaptersQuery(params.bookId))]),
  component: () => (
    <BookPage
      bookId={Route.useParams().bookId}
      chooseLength={(choice) => <ChooseLength {...choice} />}
    />
  ),
})
