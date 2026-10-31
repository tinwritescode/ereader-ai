import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Voice } from '../domain/controller'
import { voicesQuery } from '../data/speech'

/** Hands the server's voices to pages of other features; none until they load. */
export function WithVoices({ children }: { children: (voices: Voice[]) => ReactNode }) {
  const { data = [] } = useQuery(voicesQuery())
  return children(data)
}
