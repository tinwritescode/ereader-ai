import { createFileRoute, redirect } from '@tanstack/react-router'
import { WithAccount } from '~/features/account/ui/with-account'
import { booksQuery, chaptersQuery } from '~/features/books/data/books'
import { WithBook } from '~/features/books/ui/with-book'
import { ListenPort } from '~/features/listen/ui/listen-port'
import { ReaderSearch } from '~/features/reading/domain/length'
import { wholeLength } from '~/features/reading/domain/spot'
import { ReaderPage } from '~/features/reading/ui/reader-page'
import { PrepareChapter, TranslationNotice } from '~/features/tasks/ui/chapter-extras'

export const Route = createFileRoute('/_app/books/$bookId/chapters/$chapterId')({
  validateSearch: ReaderSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, params, deps: { search } }) => {
    const [, chapters] = await Promise.all([context.queryClient.ensureQueryData(booksQuery()), context.queryClient.ensureQueryData(chaptersQuery(params.bookId))])
    const chapter = chapters.find(({ chapterId }) => chapterId === params.chapterId)
    const fixed = chapter && wholeLength({ search, chapterMinutes: chapter.minutes })
    if (fixed) throw redirect({ to: '/books/$bookId/chapters/$chapterId', params, search: fixed, replace: true })
  },
  component: function View() {
    const { bookId, chapterId } = Route.useParams()
    const search = Route.useSearch()
    return (
      <WithBook bookId={bookId}>
        {(shelf) => (
          <WithAccount>
            {(account) => (
              <ListenPort {...shelf} chapterId={chapterId} option={search} prepare={(job) => <PrepareChapter account={account} {...job} />}>
                {(port) => (
                  <ReaderPage
                    {...shelf}
                    chapterId={chapterId}
                    search={search}
                    voice={port.voice}
                    bar={port.bar}
                    translationNotice={({ onOriginal }) => <TranslationNotice bookId={bookId} chapterId={chapterId} onOriginal={onOriginal} />}
                  />
                )}
              </ListenPort>
            )}
          </WithAccount>
        )}
      </WithBook>
    )
  },
})
