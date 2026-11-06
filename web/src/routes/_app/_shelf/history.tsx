import { createFileRoute } from '@tanstack/react-router'
import { booksQuery } from '~/features/books/data/books'
import { WithBooks } from '~/features/books/ui/with-books'
import { historyQuery } from '~/features/reading/data/history'
import { HistoryPage } from '~/features/reading/ui/history-page'
import { pageTitle } from '~/shared/ui/page-title'

export const Route = createFileRoute('/_app/_shelf/history')({
  head: () => ({ meta: [{ title: pageTitle('Lịch sử') }] }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(historyQuery()),
      context.queryClient.ensureQueryData(booksQuery()),
    ]),
  component: () => <WithBooks>{(books) => <HistoryPage books={books} />}</WithBooks>,
})
