import { useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
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
        <span className="stopped-kind">
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
      <Link className="task-link" to="/books/$bookId" params={{ bookId: task.bookId }}>
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
          <span className="track" aria-hidden="true">
            <i style={{ width: `${row.percent}%` }} />
          </span>
          <i className="p">{`${row.percent}%`}</i> <span className="soft">{row.progress}</span>
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
    <table>
      <thead>
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
        <div className="empty-note">
          <p className="hand">Chưa có tác vụ nào</p>
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
              <h2 className="soft" style={{ marginTop: 22 }}>
                {GROUP_NAMES[group]}
              </h2>
              <TaskTable tasks={inGroup} />
            </section>
          )
        )
      })}
      <p className="soft" style={{ marginTop: 18 }}>
        Dòng cũ hơn 7 ngày tự ẩn. Audio đã tạo vẫn được giữ.
      </p>
    </>
  )
}
