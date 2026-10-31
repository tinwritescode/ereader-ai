import { useQueryClient } from '@tanstack/react-query'
import { useOptimistic, useTransition } from 'react'
import { codeOf, errorMessage } from '~/features/books/domain/words'
import { useNotice } from '~/shared/ui/notice'
import { PLAN_NAMES, isHigher, planLabel, planLines } from '../domain/account'
import type { PlanName } from '../domain/account'
import { meQuery, requestPlan } from '../data/account'
import { useAccount } from './with-account'

/** The request shows as sent at once; it goes back if the server refuses. */
export function PlansPage() {
  const account = useAccount()
  const queryClient = useQueryClient()
  const notice = useNotice()
  const [requested, setRequested] = useOptimistic(account.requestedPlan)
  const [pending, startTransition] = useTransition()
  const ask = (plan: PlanName) =>
    startTransition(async () => {
      setRequested(plan)
      try {
        await requestPlan({ data: { plan } })
        await queryClient.invalidateQueries({ queryKey: meQuery().queryKey })
      } catch (error) {
        notice({ text: `Chưa gửi được yêu cầu. ${errorMessage(codeOf(error))}` })
      }
    })
  return (
    <>
      <h1>Các gói</h1>
      <div style={{ marginTop: 16 }}>
        {PLAN_NAMES.map((plan) => {
          const current = plan === account.plan
          return (
            <section key={plan} className={`plan-card ${current ? 'current' : ''}`} aria-label={`Gói ${planLabel(plan)}`}>
              <header>
                {planLabel(plan)}
                {current && <span className="hand">đang dùng</span>}
              </header>
              <ul>
                {planLines(account.plans[plan]).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {isHigher(plan, account.plan) &&
                (requested === plan ? (
                  <p className="hand">đã gửi yêu cầu</p>
                ) : (
                  <button type="button" className="primary" disabled={pending} onClick={() => ask(plan)}>
                    Yêu cầu nâng gói
                  </button>
                ))}
            </section>
          )
        })}
      </div>
    </>
  )
}
