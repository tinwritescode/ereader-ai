import { useMutation, useQueryClient } from '@tanstack/react-query'
import { codeOf, errorMessage } from '~/features/books/domain/words'
import { useNotice } from '~/shared/ui/notice'
import type { LongTask } from '../domain/task'
import { cancelTask, resumeTask, tasksQuery } from '../data/tasks'

/** Cancel disappears the row at once and puts it back if the server says no. */
export function useTaskActions() {
  const queryClient = useQueryClient()
  const notice = useNotice()
  const key = tasksQuery().queryKey
  const settle = () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  const cancel = useMutation({
    mutationFn: (task: LongTask) => cancelTask({ data: { kind: task.kind, id: task.id } }),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (all) => all?.filter((entry) => entry.id !== task.id))
      return { before }
    },
    onError: (error, _task, saved) => {
      queryClient.setQueryData(key, saved?.before)
      notice({ text: `Chưa huỷ được. ${errorMessage(codeOf(error))}` })
    },
    onSettled: settle,
  })
  const resume = useMutation({
    mutationFn: (task: LongTask) => resumeTask({ data: { kind: task.kind, id: task.id } }),
    onError: (error) => notice({ text: `Chưa chạy tiếp được. ${errorMessage(codeOf(error))}` }),
    onSettled: settle,
  })
  // Only the task being resumed shows that it is at work.
  return {
    cancel: cancel.mutate,
    resume: resume.mutate,
    resuming: resume.isPending ? (resume.variables?.id ?? null) : null,
  }
}
