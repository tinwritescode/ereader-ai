import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { booksQuery, chaptersQuery } from '~/features/books/data/books'
import { historyQuery } from '~/features/reading/data/history'
import { planBookIds } from '~/features/reading/domain/today'
import { TodayPage } from '~/features/reading/ui/today-page'
import { pageTitle } from '~/shared/ui/page-title'

export const Route = createFileRoute('/_app/_shelf/today')({
  head: () => ({ meta: [{ title: pageTitle('Hôm nay') }] }),
  loader: async ({ context: { queryClient } }) => {
    const [{ sessions }, books] = await Promise.all([
      queryClient.ensureQueryData(historyQuery()),
      queryClient.ensureQueryData(booksQuery()),
    ])
    await Promise.all(
      planBookIds({ sessions, books }).map((bookId) => queryClient.ensureQueryData(chaptersQuery(bookId))),
    )
  },
  component: TodayRoute,
})

/** Gathers the chapters of the books the plan draws from. */
function TodayRoute() {
  const { sessions } = useSuspenseQuery(historyQuery()).data
  const books = useSuspenseQuery(booksQuery()).data
  const bookIds = planBookIds({ sessions, books })
  const lists = useSuspenseQueries({ queries: bookIds.map((bookId) => chaptersQuery(bookId)) })
  const shelves = bookIds.flatMap((bookId, index) => {
    const book = books.find((entry) => entry.bookId === bookId)
    const chapters = lists[index]?.data
    return book && chapters ? [{ book, chapters }] : []
  })
  return <TodayPage sessions={sessions} shelves={shelves} />
}
