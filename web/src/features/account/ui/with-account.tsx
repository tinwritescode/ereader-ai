import { useSuspenseQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { meQuery } from '../data/account'
import type { Account } from '../domain/account'

export function useAccount(): Account {
  return useSuspenseQuery(meQuery()).data
}

/** Hands the signed-in account to pages of other features. */
export function WithAccount({ children }: { children: (account: Account) => ReactNode }) {
  return children(useAccount())
}
