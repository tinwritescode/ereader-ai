import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, m } from 'motion/react'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { booksQuery } from '../data/books'
import { uploadEpub } from '../data/upload'
import type { Book } from '../domain/book'
import { codeOf, errorMessage } from '../domain/words'
import { BookCover } from './book-cover'

type Upload =
  | { kind: 'none' }
  | { kind: 'uploading'; fileName: string; share: number }
  | { kind: 'failed'; fileName: string; code: string }

function hasFiles(event: React.DragEvent): boolean {
  return event.dataTransfer.types.includes('Files')
}

export function LibraryPage({
  continueReading,
  captionOf,
}: {
  continueReading: ReactNode
  captionOf: (book: Book) => ReactNode
}) {
  const { data: books } = useSuspenseQuery(booksQuery())
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState<Upload>({ kind: 'none' })
  const [dragging, setDragging] = useState(false)

  const importEpub = useMutation({
    mutationFn: (file: File) =>
      uploadEpub({ file, onProgress: (share) => setUpload({ kind: 'uploading', fileName: file.name, share }) }),
    onMutate: (file) => setUpload({ kind: 'uploading', fileName: file.name, share: 0 }),
    onSuccess: (book) => {
      // Importing the same file again returns the existing book; keep one entry per book.
      queryClient.setQueryData(booksQuery().queryKey, (all) => [
        book,
        ...(all ?? []).filter((entry) => entry.bookId !== book.bookId),
      ])
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      setUpload({ kind: 'none' })
    },
    onError: (error, file) => setUpload({ kind: 'failed', fileName: file.name, code: codeOf(error) }),
  })

  const choose = (file: File | undefined) => {
    if (file && upload.kind !== 'uploading') importEpub.mutate(file)
  }

  return (
    <div
      onDragEnter={(event) => {
        if (hasFiles(event)) setDragging(true)
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault()
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget === null) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        choose(event.dataTransfer.files[0])
      }}
      className="min-h-[70dvh]"
    >
      <h1>Thư viện</h1>
      {continueReading}
      {books.length === 0 && <p className="soft">Chưa có sách nào. Thêm một file EPUB để bắt đầu đọc.</p>}
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-line md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:gap-x-4.5">
        <AnimatePresence initial={false}>
          {books.map((book) => (
            // Only a book added now arrives: it drops onto the shelf and settles.
            <m.div
              key={book.bookId}
              className="min-w-0"
              initial={{ opacity: 0, y: -48, rotate: -7 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 19 }}
            >
              <Link
                className="group/book relative block no-underline hover:z-5 focus-visible:z-5"
                to="/books/$bookId"
                params={{ bookId: book.bookId }}
                viewTransition
              >
                <BookCover book={book} />
                <b className="mt-2.5 line-clamp-2 text-sm/5 font-semibold text-ink">{book.title}</b>
                <div className="text-[12.5px]/4.5 wrap-anywhere text-muted [&_.hand]:text-[17px]/5">
                  {book.author}
                  <div>{captionOf(book)}</div>
                </div>
              </Link>
            </m.div>
          ))}
        </AnimatePresence>
        <div>
          <button
            type="button"
            className="group/add flex aspect-[1/1.48] w-full flex-col items-center justify-center rounded-[2px_5px_5px_2px] border-[1.5px] border-dashed border-ink p-3.5 text-[13px]/4.5 font-semibold text-ink"
            onClick={() => input.current?.click()}
          >
            <i
              className="font-hand text-[34px]/9 not-italic transition-transform duration-300 ease-hinge group-hover/add:rotate-90"
              aria-hidden="true"
            >
              +
            </i>
            Thêm sách EPUB
            <small className="text-xs font-normal text-muted">hoặc kéo file vào đây</small>
          </button>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept=".epub,application/epub+zip"
            aria-label="Thêm sách EPUB"
            tabIndex={-1}
            onChange={(event) => {
              choose(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
      </div>
      <UploadNote upload={upload} />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center border-[3px] border-dashed border-ink bg-[rgb(246_245_252/0.92)] font-hand text-[32px] text-ink">
          Thả sách vào đây
        </div>
      )}
    </div>
  )
}

function UploadNote({ upload }: { upload: Upload }) {
  switch (upload.kind) {
    case 'none':
      return null
    case 'uploading':
      return (
        <p
          className="mt-3 text-sm"
          role="status"
        >{`${upload.fileName}: Đang tải lên, ${Math.round(upload.share * 100)}%`}</p>
      )
    case 'failed':
      return (
        <p
          className="failure mt-3"
          role="alert"
        >{`${upload.fileName}: Không thêm được. ${errorMessage(upload.code)}`}</p>
      )
    default: {
      const _exhaustive: never = upload
      return _exhaustive
    }
  }
}
