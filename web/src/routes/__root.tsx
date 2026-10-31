import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { Devtools } from '~/shared/ui/devtools'
import { Hydrated } from '~/shared/ui/hydrated'
import { MotionRoot } from '~/shared/ui/motion'
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
        <MotionRoot>
          <NoticeProvider>
            <Outlet />
          </NoticeProvider>
        </MotionRoot>
        <Hydrated />
        <Devtools />
        <Scripts />
      </body>
    </html>
  ),
})
