import { QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { codeOf } from '~/features/books/domain/words'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: (failures, error) => failures < 1 && codeOf(error) === 'NETWORK_ERROR' },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        if (typeof window !== 'undefined' && codeOf(error) === 'SIGN_IN_REQUIRED') window.location.assign('/login')
      },
    }),
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
