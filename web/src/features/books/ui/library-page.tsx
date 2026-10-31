import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
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
      style={{ minHeight: '70dvh' }}
    >
      <h1>Thư viện</h1>
      {continueReading}
      {books.length === 0 && <p className="soft">Chưa có sách nào. Thêm một file EPUB để bắt đầu đọc.</p>}
      <div className="covers">
        {books.map((book) => (
          <Link key={book.bookId} className="book-tile" to="/books/$bookId" params={{ bookId: book.bookId }}>
            <BookCover book={book} />
            <b className="tile-title">{book.title}</b>
            <div className="cap">
              {book.author}
              <div>{captionOf(book)}</div>
            </div>
          </Link>
        ))}
        <div>
          <button type="button" className="add-book" onClick={() => input.current?.click()}>
            <i aria-hidden="true">+</i>
            Thêm sách EPUB
            <small>hoặc kéo file vào đây</small>
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
      {dragging && <div className="drop-veil">Thả sách vào đây</div>}
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
          className="upload-note"
          role="status"
        >{`${upload.fileName}: Đang tải lên, ${Math.round(upload.share * 100)}%`}</p>
      )
    case 'failed':
      return (
        <p
          className="upload-note failure"
          role="alert"
        >{`${upload.fileName}: Không thêm được. ${errorMessage(upload.code)}`}</p>
      )
    default: {
      const _exhaustive: never = upload
      return _exhaustive
    }
  }
}
