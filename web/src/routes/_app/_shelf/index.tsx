import { createFileRoute } from '@tanstack/react-router'
import { booksQuery } from '~/features/books/data/books'
import { LibraryPage } from '~/features/books/ui/library-page'

export const Route = createFileRoute('/_app/_shelf/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(booksQuery()),
  component: () => <LibraryPage continueReading={null} captionOf={() => null} />,
})
