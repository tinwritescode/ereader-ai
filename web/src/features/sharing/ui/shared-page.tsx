import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { chapterHeading } from '~/features/books/domain/book'
import type { ChapterSummary } from '~/features/books/domain/book'
import { codeOf, errorMessage } from '~/features/books/domain/words'
import { Button } from '~/shared/ui/button'
import { openShare, sharedBookQuery, sharedChapterQuery } from '../data/shares'

function PasswordForm({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const open = useMutation({
    mutationFn: () => openShare({ data: { token, password } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sharedBookQuery(token).queryKey }),
  })
  return (
    <form
      className="centred-page"
      onSubmit={(event) => {
        event.preventDefault()
        open.mutate()
      }}
    >
      <h1 className="text-[26px]/7">Sách được chia sẻ</h1>
      <p className="soft">Link này chỉ mở được trên một máy. Máy nhập đúng mật khẩu đầu tiên sẽ giữ link.</p>
      <label className="flex flex-col gap-1 text-left text-sm font-semibold text-ink">
        Mật khẩu
        <input
          className="min-h-11 w-full rounded-lg border-2 border-ink bg-paper px-3 text-ink"
          type="password"
          autoComplete="off"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {open.error && <p className="failure">{errorMessage(codeOf(open.error))}</p>}
      <button type="submit" className="primary" disabled={open.isPending}>
        Mở sách
      </button>
    </form>
  )
}

function Chapters({ token, chapters }: { token: string; chapters: ChapterSummary[] }) {
  return (
    <ol className="flex flex-col">
      {chapters.map((chapter) => {
        const { number, title } = chapterHeading(chapter)
        return (
          <li key={chapter.chapterId} className="border-t-[1.5px] border-ink/42">
            <Link
              className="block py-2 text-ink no-underline"
              to="/s/$token"
              params={{ token }}
              search={{ chapter: chapter.chapterId }}
            >
              {number && <small className="block font-hand text-[18px]/7 text-muted">{number}</small>}
              <b className="text-[15.5px]/7 font-semibold">{title}</b>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

function Chapter({ token, chapterId, next }: { token: string; chapterId: string; next: ChapterSummary | undefined }) {
  const chapter = useQuery(sharedChapterQuery({ token, chapterId }))
  const [original, setOriginal] = useState(false)
  if (chapter.isPending) return <p className="soft">Đang mở chương…</p>
  if (!chapter.data) return <p className="failure">{errorMessage(codeOf(chapter.error))}</p>
  const { vietnamese } = chapter.data
  const blocks = vietnamese && !original ? vietnamese : chapter.data.original
  return (
    <>
      {vietnamese && (
        <Button quiet onClick={() => setOriginal(!original)}>
          {original ? 'Tiếng Việt' : 'Bản gốc'}
        </Button>
      )}
      <article className="text reading-text">
        {blocks.map((block, index) => {
          const Tag = block.kind === 'heading' ? 'h2' : 'p'
          return (
            <Tag key={index} data-block={index}>
              {block.text}
            </Tag>
          )
        })}
      </article>
      {next && (
        <Link
          className="ink-link mt-line inline-block"
          to="/s/$token"
          params={{ token }}
          search={{ chapter: next.chapterId }}
        >
          Chương sau ›
        </Link>
      )}
    </>
  )
}

/** A viewer reads and only reads: nothing here writes, and the backend gives a link no way to. */
export function SharedPage({ token, chapterId }: { token: string; chapterId: string | undefined }) {
  const book = useQuery(sharedBookQuery(token))
  if (book.isPending) return <p className="soft centred-page">Đang mở sách…</p>
  if (!book.data) {
    const code = codeOf(book.error)
    if (code === 'SHARE_LOCKED') return <PasswordForm token={token} />
    return (
      <div className="centred-page">
        <p className="failure">{errorMessage(code)}</p>
      </div>
    )
  }
  const { title, author, chapters } = book.data
  const at = chapters.findIndex((chapter) => chapter.chapterId === chapterId)
  return (
    <main className="mx-auto max-w-[38em] px-5 pt-line pb-28">
      <h1 className="text-[17px]/[21px] md:text-[26px]/7">{title}</h1>
      <p className="soft leading-7!">{[author, 'Chỉ đọc'].filter(Boolean).join(', ')}</p>
      {chapterId ? (
        <>
          <Link className="ink-link mb-line inline-block" to="/s/$token" params={{ token }}>
            ‹ Mục lục
          </Link>
          <Chapter key={chapterId} token={token} chapterId={chapterId} next={chapters[at + 1]} />
        </>
      ) : (
        <Chapters token={token} chapters={chapters} />
      )}
    </main>
  )
}
