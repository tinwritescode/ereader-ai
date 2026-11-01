import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Book, ChapterSummary } from '~/features/books/domain/book'
import { codeOf, errorMessage } from '~/features/books/domain/words'
import type { ChapterText } from '~/features/reading/domain/chapter-text'
import type { LengthOption } from '~/features/reading/domain/length'
import { Paper } from '~/shared/ui/shell'
import { openShare, sharedBookQuery, sharedChapterQuery, sharedVoicesQuery } from '../data/shares'
import type { SharedVersion } from '../data/shares'

/** Written in the margin in red pen. Nothing on these pages writes, and the backend gives a link no way to. */
export function ReadOnlyNote() {
  return <span className="inline-block -rotate-2 leading-11 text-red">chỉ đọc</span>
}

function PasswordForm({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const open = useMutation({
    mutationFn: () => openShare({ data: { token, password } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sharedBookQuery(token).queryKey }),
  })
  return (
    <form
      className="flex max-w-95 flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        open.mutate()
      }}
    >
      <h1 className="text-[17px]/[21px] md:text-[26px]/7">Sách được chia sẻ</h1>
      <p className="soft">Link này chỉ mở được trên một máy. Máy nhập đúng mật khẩu đầu tiên sẽ giữ link.</p>
      <label className="mt-line flex flex-col text-sm font-semibold text-ink">
        Mật khẩu
        <input
          className="h-9 border-0 border-b-[1.5px] border-ink bg-transparent text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          type="password"
          autoComplete="off"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {open.error && <p className="failure">{errorMessage(codeOf(open.error))}</p>}
      <button type="submit" className="primary mt-2" disabled={open.isPending}>
        Mở sách
      </button>
    </form>
  )
}

/** Hands the shared book to the page, once this machine holds the link. */
export function WithSharedBook({
  token,
  children,
}: {
  token: string
  children: (shelf: { book: Book; chapters: ChapterSummary[] }) => ReactNode
}) {
  const shared = useQuery(sharedBookQuery(token))
  if (shared.data) {
    const { chapters, ...book } = shared.data
    return children({ book, chapters })
  }
  const code = shared.error ? codeOf(shared.error) : null
  return (
    <Paper ways={null}>
      {code === null && <p className="soft">Đang mở sách…</p>}
      {code === 'SHARE_LOCKED' && <PasswordForm token={token} />}
      {code !== null && code !== 'SHARE_LOCKED' && <p className="failure">{errorMessage(code)}</p>}
    </Paper>
  )
}

/** A chapter's words, in Vietnamese where there is a translation unless the viewer chose the original, and whether they can be heard. */
export function WithSharedText({
  token,
  chapterId,
  minutes,
  wanted,
  children,
}: {
  token: string
  chapterId: string
  minutes: number
  wanted: LengthOption['length'] | undefined
  children: (read: {
    text: ChapterText
    option: LengthOption
    options: LengthOption[]
    version: SharedVersion
    voiced: boolean
  }) => ReactNode
}) {
  const chapter = useQuery(sharedChapterQuery({ token, chapterId }))
  const vietnamese = chapter.data?.vietnamese ?? null
  const original: LengthOption = { length: 'original', minutes }
  const translated: LengthOption = { length: 'vietnamese', minutes }
  const options = vietnamese ? [original, translated] : [original]
  const inVietnamese = vietnamese && wanted !== 'original'
  const version = inVietnamese ? 'vietnamese' : 'original'
  const voices = useQuery({ ...sharedVoicesQuery({ token, chapterId, version }), enabled: chapter.isSuccess })
  const text = (): ChapterText => {
    if (chapter.data) return { kind: 'loaded', blocks: inVietnamese ? vietnamese : chapter.data.original }
    if (chapter.error) {
      return { kind: 'failed', code: codeOf(chapter.error), retry: () => void chapter.refetch() }
    }
    return { kind: 'loading', shortening: false }
  }
  return children({
    text: text(),
    option: inVietnamese ? translated : original,
    options,
    version,
    voiced: Boolean(voices.data?.length),
  })
}
