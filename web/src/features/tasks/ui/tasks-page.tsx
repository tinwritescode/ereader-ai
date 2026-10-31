import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import { Track } from '~/shared/ui/track'
import { GROUP_NAMES, groupOf, rowOf } from '../domain/task'
import type { LongTask, TaskGroup } from '../domain/task'
import { tasksQuery } from '../data/tasks'
import { useTaskActions } from './use-task-actions'

const features = tableFeatures({})
const column = createColumnHelper<typeof features, LongTask>()
const GROUPS: TaskGroup[] = ['running', 'queued', 'finished']

function TaskAction({ task }: { task: LongTask }) {
  const actions = useTaskActions()
  if (task.state === 'done') return null
  const stopped = task.state === 'stopped'
  return (
    <button
      type="button"
      className="ink-link"
      aria-label={`${stopped ? 'Chạy tiếp' : 'Huỷ'} ${rowOf(task).name}`}
      onClick={() => (stopped ? actions.resume(task) : actions.cancel(task))}
    >
      {stopped ? 'Chạy tiếp' : 'Huỷ'}
    </button>
  )
}

// Outside any render: FlexRender mounts a cell by its function, so a new one would remount the row.
const columns = column.columns([
  column.display({
    id: 'kind',
    header: 'Việc',
    cell: ({ row: { original: task } }) => {
      const row = rowOf(task)
      return task.state === 'stopped' ? (
        <span className="text-red">
          {row.stoppedNote}
          <br />
          <small>{row.failure}</small>
        </span>
      ) : (
        row.kind
      )
    },
  }),
  column.display({
    id: 'book',
    header: 'Sách',
    cell: ({ row: { original: task } }) => (
      <Link className="no-underline" to="/books/$bookId" params={{ bookId: task.bookId }}>
        {rowOf(task).name}
      </Link>
    ),
  }),
  column.display({
    id: 'progress',
    header: 'Tiến độ',
    cell: ({ row: { original: task } }) => {
      const row = rowOf(task)
      return (
        <>
          <Track
            className="mt-0! mr-2 inline-block w-[calc(100%-120px)] md:w-[calc(100%-180px)]"
            percent={row.percent}
          />
          <i className="font-hand text-[19px] text-red not-italic">{`${row.percent}%`}</i>{' '}
          <span className="soft">{row.progress}</span>
        </>
      )
    },
  }),
  column.display({
    id: 'action',
    header: () => <span className="sr-only">Thao tác</span>,
    cell: ({ row: { original: task } }) => <TaskAction task={task} />,
  }),
])

function TaskTable({ tasks }: { tasks: LongTask[] }) {
  const table = useTable({ features, columns, data: tasks, getRowId: (task) => task.id })
  return (
    <table className="m-0 max-w-170 [&_td]:col-start-1 [&_td]:border-0 [&_td]:p-0 [&_td]:leading-7 [&_td:first-child]:text-[12.5px] [&_td:first-child]:text-muted [&_td:last-child]:col-start-2 [&_td:last-child]:row-span-3 [&_td:last-child]:row-start-1 [&_td:last-child]:self-center [&_td:nth-child(2)]:font-semibold [&_td:nth-child(2)]:text-ink [&_tr]:grid [&_tr]:grid-cols-[1fr_auto] [&_tr]:border-b [&_tr]:border-rule [&_tr]:pb-2">
      <thead className="sr-only">
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id}>
                <table.FlexRender header={header} />
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getAllCells().map((cell) => (
              <td key={cell.id}>
                <table.FlexRender cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TasksPage() {
  const { data: tasks } = useSuspenseQuery(tasksQuery())
  if (tasks.length === 0) {
    return (
      <>
        <h1>Tác vụ</h1>
        <div className="mt-12">
          <p className="hand origin-left -rotate-2 text-[28px]">Chưa có tác vụ nào</p>
          <p className="soft">Khi tạo sẵn giọng đọc hay dịch cả sách, tiến độ sẽ hiện ở đây.</p>
        </div>
      </>
    )
  }
  return (
    <>
      <h1>Tác vụ</h1>
      {GROUPS.map((group) => {
        const inGroup = tasks.filter((task) => groupOf(task) === group)
        return (
          inGroup.length > 0 && (
            <section key={group} aria-label={GROUP_NAMES[group]}>
              <h2 className="hand mt-line text-[21px]/7">{GROUP_NAMES[group]}</h2>
              <TaskTable tasks={inGroup} />
            </section>
          )
        )
      })}
      <p className="soft mt-4.5">Dòng cũ hơn 7 ngày tự ẩn. Audio đã tạo vẫn được giữ.</p>
    </>
  )
}
