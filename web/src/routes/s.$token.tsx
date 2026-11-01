import { createFileRoute, linkOptions } from '@tanstack/react-router'
import { z } from 'zod'
import { BookView } from '~/features/books/ui/book-page'
import { Reader } from '~/features/reading/ui/reader-page'
import { ReadOnlyNote, WithSharedBook, WithSharedText } from '~/features/sharing/ui/shared-page'
import { pageTitle } from '~/shared/ui/page-title'
import { Paper } from '~/shared/ui/shell'

const PAGE_TURN = { types: ['page-turn'] }

export const Route = createFileRoute('/s/$token')({
  validateSearch: z.object({
    chapter: z.string().optional(),
    length: z.enum(['original', 'vietnamese']).optional().catch(undefined),
  }),
  // The link is the secret: keep it out of search engines and out of the Referer of anything linked to.
  head: () => ({
    meta: [
      { title: pageTitle('Sách được chia sẻ') },
      { name: 'robots', content: 'noindex' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: function View() {
    const { token } = Route.useParams()
    const { chapter: chapterId, length } = Route.useSearch()
    const navigate = Route.useNavigate()
    return (
      <WithSharedBook token={token}>
        {({ book, chapters }) =>
          chapterId === undefined ? (
            <Paper ways={<ReadOnlyNote />}>
              <BookView
                book={book}
                chapters={chapters}
                onChoose={(chosen) => void navigate({ search: { chapter: chosen.chapterId } })}
              />
            </Paper>
          ) : (
            <WithSharedText
              token={token}
              chapterId={chapterId}
              minutes={chapters.find((chapter) => chapter.chapterId === chapterId)?.minutes ?? 0}
              wanted={length}
            >
              {({ text, option, options }) => (
                <Reader
                  book={book}
                  chapters={chapters}
                  chapterId={chapterId}
                  search={option}
                  text={text}
                  options={options}
                  onChoose={(chosen) =>
                    void navigate({
                      search: { chapter: chapterId, length: chosen.length === 'original' ? 'original' : 'vietnamese' },
                      replace: true,
                    })
                  }
                  contents={linkOptions({ to: '/s/$token', params: { token } })}
                  chapterLink={(next) =>
                    linkOptions({
                      to: '/s/$token',
                      params: { token },
                      search: { chapter: next.chapterId },
                      viewTransition: PAGE_TURN,
                    })
                  }
                  note={<ReadOnlyNote />}
                />
              )}
            </WithSharedText>
          )
        }
      </WithSharedBook>
    )
  },
})
