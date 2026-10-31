import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { Devtools } from '~/shared/ui/devtools'
import { Hydrated } from '~/shared/ui/hydrated'
import { NoticeProvider } from '~/shared/ui/notice'
import themeCss from '~/shared/ui/theme.css?url'
import { PageFailed, PageMissing } from './-page-states'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Sổ đọc' },
    ],
    links: [{ rel: 'stylesheet', href: themeCss }],
  }),
  errorComponent: PageFailed,
  notFoundComponent: PageMissing,
  component: () => (
    <html lang="vi">
      <head>
        <HeadContent />
      </head>
      <body>
        <NoticeProvider>
          <Outlet />
        </NoticeProvider>
        <Hydrated />
        <Devtools />
        <Scripts />
      </body>
    </html>
  ),
})
