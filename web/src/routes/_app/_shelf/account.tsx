import { createFileRoute } from '@tanstack/react-router'
import { AccountPage } from '~/features/account/ui/account-page'
import { booksQuery } from '~/features/books/data/books'
import { WithBooks } from '~/features/books/ui/with-books'

export const Route = createFileRoute('/_app/_shelf/account')({
  loader: ({ context }) => context.queryClient.ensureQueryData(booksQuery()),
  component: () => <WithBooks>{(books) => <AccountPage booksCount={books.length} />}</WithBooks>,
})
