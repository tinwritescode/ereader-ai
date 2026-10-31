import { useSuspenseQuery } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { booksQuery, chaptersQuery } from '../data/books'
import type { Book, ChapterSummary } from '../domain/book'

export type Shelf = { book: Book; chapters: ChapterSummary[] }

export function useShelf(bookId: string): Shelf {
  const { data: books } = useSuspenseQuery(booksQuery())
  const { data: chapters } = useSuspenseQuery(chaptersQuery(bookId))
  const book = books.find((entry) => entry.bookId === bookId)
  if (!book) throw notFound()
  return { book, chapters }
}

/** Hands a book and its chapters to pages of other features. */
export function WithBook({ bookId, children }: { bookId: string; children: (shelf: Shelf) => ReactNode }) {
  return children(useShelf(bookId))
}
