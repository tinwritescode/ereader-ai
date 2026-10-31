import { useSuspenseQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { booksQuery } from '../data/books'
import type { Book } from '../domain/book'

/** Hands the shelf to pages of other features. */
export function WithBooks({ children }: { children: (books: Book[]) => ReactNode }) {
  return children(useSuspenseQuery(booksQuery()).data)
}
