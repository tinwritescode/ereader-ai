import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, ScriptOnce, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { Devtools } from '~/shared/ui/devtools'
import { Hydrated } from '~/shared/ui/hydrated'
import { MotionRoot } from '~/shared/ui/motion'
import { NOEL_BEFORE_PAINT, NoelClass } from '~/shared/ui/noel'
import { NoticeProvider } from '~/shared/ui/notice'
import { HOME_TITLE } from '~/shared/ui/page-title'
import themeCss from '~/shared/ui/theme.css?url'
import { PageFailed, PageMissing } from './-page-states'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: HOME_TITLE },
      { name: 'description', content: 'Rút gọn chương sách theo số phút bạn có, rồi đọc hoặc nghe bằng tiếng Việt.' },
    ],
    links: [
      { rel: 'stylesheet', href: themeCss },
      { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  errorComponent: PageFailed,
  notFoundComponent: PageMissing,
  component: () => (
    // The script below sets the Christmas class before React arrives.
    <html lang="vi" suppressHydrationWarning>
      <head>
        <HeadContent />
        <ScriptOnce>{NOEL_BEFORE_PAINT}</ScriptOnce>
      </head>
      <body>
        <MotionRoot>
          <NoticeProvider>
            <Outlet />
          </NoticeProvider>
        </MotionRoot>
        <NoelClass />
        <Hydrated />
        <Devtools />
        <Scripts />
      </body>
    </html>
  ),
})
