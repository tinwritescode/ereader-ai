import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SharedPage } from '~/features/sharing/ui/shared-page'
import { pageTitle } from '~/shared/ui/page-title'

export const Route = createFileRoute('/s/$token')({
  validateSearch: z.object({ chapter: z.string().optional() }),
  // The link is the secret: keep it out of search engines and out of the Referer of anything linked to.
  head: () => ({
    meta: [
      { title: pageTitle('Sách được chia sẻ') },
      { name: 'robots', content: 'noindex' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: function View() {
    return <SharedPage token={Route.useParams().token} chapterId={Route.useSearch().chapter} />
  },
})
