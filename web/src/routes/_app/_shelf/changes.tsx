import { createFileRoute } from '@tanstack/react-router'
import { changelogQuery } from '~/features/changelog/data/changelog'
import { ChangelogPage } from '~/features/changelog/ui/changelog-page'
import { pageTitle } from '~/shared/ui/page-title'

export const Route = createFileRoute('/_app/_shelf/changes')({
  head: () => ({ meta: [{ title: pageTitle('Có gì mới') }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(changelogQuery()),
  component: ChangelogPage,
})
