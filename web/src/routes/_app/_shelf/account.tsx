import { createFileRoute } from '@tanstack/react-router'
import { AccountPage } from '~/features/account/ui/account-page'
import { booksQuery } from '~/features/books/data/books'
import { WithBooks } from '~/features/books/ui/with-books'
import { ChangelogLink } from '~/features/changelog/ui/changelog-link'
import { pageTitle } from '~/shared/ui/page-title'

export const Route = createFileRoute('/_app/_shelf/account')({
  head: () => ({ meta: [{ title: pageTitle('Tài khoản') }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(booksQuery()),
  component: () => (
    <WithBooks>{(books) => <AccountPage booksCount={books.length} changelogLink={<ChangelogLink />} />}</WithBooks>
  ),
})
