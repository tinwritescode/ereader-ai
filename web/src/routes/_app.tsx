import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requireAccount } from '~/features/account/data/account'
import { ListenProvider } from '~/features/listen/ui/listen-provider'
import { MiniPlayer } from '~/features/listen/ui/mini-player'
import { recordHeard } from '~/features/reading/ui/heard'
import { recordHeardSession } from '~/features/reading/ui/history-recorder'
import { TaskNotices } from '~/features/tasks/ui/task-notices'

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => requireAccount(context.queryClient),
  component: () => (
    <ListenProvider
      onHeard={(heard) => {
        recordHeard(heard)
        recordHeardSession(heard)
      }}
    >
      <Outlet />
      <MiniPlayer />
      <TaskNotices />
    </ListenProvider>
  ),
})
