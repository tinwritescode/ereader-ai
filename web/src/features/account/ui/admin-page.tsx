import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { codeOf, errorMessage } from '~/features/books/domain/words'
import { useNotice } from '~/shared/ui/notice'
import { PLAN_NAMES, PlanName, adminNote, planLabel } from '../domain/account'
import type { ManagedAccount } from '../domain/account'
import { accountsQuery, setPlan } from '../data/account'

const features = tableFeatures({})
const column = createColumnHelper<typeof features, ManagedAccount>()

function PlanForm({ account }: { account: ManagedAccount }) {
  const queryClient = useQueryClient()
  const notice = useNotice()
  const save = useMutation({
    mutationFn: (plan: PlanName) => setPlan({ data: { id: account.id, plan } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountsQuery().queryKey }),
    onError: (error) => notice({ text: `Chưa đổi được gói. ${errorMessage(codeOf(error))}` }),
  })
  const form = useForm({
    defaultValues: { plan: account.plan },
    validators: { onChange: ({ value }) => (PlanName.safeParse(value.plan).success ? undefined : 'Gói không hợp lệ') },
    onSubmit: ({ value }) => save.mutateAsync(value.plan),
  })
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <form.Field name="plan">
        {(field) => (
          <fieldset className="segments" style={{ border: 0, padding: 0 }}>
            <legend className="sr-only">{`Gói của ${account.email}`}</legend>
            {PLAN_NAMES.map((plan) => (
              <label key={plan}>
                <input
                  type="radio"
                  name={`plan-${account.id}`}
                  value={plan}
                  checked={field.state.value === plan}
                  onChange={() => field.handleChange(plan)}
                />
                {planLabel(plan)}
              </label>
            ))}
          </fieldset>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => [state.isDirty, state.isSubmitting] as const}>
        {([dirty, submitting]) =>
          dirty && (
            <button
              type="submit"
              className="ink-link"
              disabled={submitting}
              aria-label={`Lưu gói của ${account.email}`}
            >
              Lưu
            </button>
          )
        }
      </form.Subscribe>
    </form>
  )
}

const columns = column.columns([
  column.accessor('email', { header: 'Email' }),
  column.display({
    id: 'note',
    header: 'Ghi chú',
    cell: ({ row: { original } }) => <span className="soft">{adminNote(original)}</span>,
  }),
  column.display({
    id: 'plan',
    header: 'Gói',
    cell: ({ row: { original } }) => <PlanForm key={original.plan} account={original} />,
  }),
])

export function AdminPage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery())
  const table = useTable({ features, columns, data: accounts, getRowId: (account) => account.id })
  return (
    <>
      <h1>Quản trị</h1>
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
    </>
  )
}
