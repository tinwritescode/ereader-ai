import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '~/shared/ui/button'
import { limitsOf, planLabel, resetLabel } from '../domain/account'
import { signOut } from '../data/account'
import { useAccount } from './with-account'

function Meter({ name, used, limit, detail }: { name: string; used: number; limit: number; detail: string }) {
  return (
    <div className="my-3.5 max-w-120">
      <b className="block text-sm font-semibold text-ink">{name}</b>
      <span
        className="my-1 block h-3.5 overflow-hidden rounded-[3px] border border-ruler-edge bg-ruler"
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
      >
        <i
          className="block h-full bg-red"
          style={{ width: `${limit === 0 ? 0 : Math.min(100, (used * 100) / limit)}%` }}
        />
      </span>
      <small className="text-[12.5px] text-muted">{detail}</small>
    </div>
  )
}

export function AccountPage({ booksCount }: { booksCount: number }) {
  const account = useAccount()
  const queryClient = useQueryClient()
  const limits = limitsOf(account)
  const resets = `làm mới ${resetLabel(account)}`
  return (
    <>
      <h1>Tài khoản</h1>
      <p className="soft">{account.email}</p>
      <p className="hand my-2.5 text-2xl">{`Gói ${planLabel(account.plan)}`}</p>
      <Meter
        name="Sách trong thư viện"
        used={booksCount}
        limit={limits.books}
        detail={`${booksCount} trên ${limits.books} cuốn`}
      />
      <Meter
        name="Rút gọn bằng AI"
        used={account.digestsUsed}
        limit={limits.monthlyDigests}
        detail={`${account.digestsUsed} trên ${limits.monthlyDigests} chương, ${resets}`}
      />
      <Meter
        name="Giọng qua mạng"
        used={account.voiceMinutesUsed}
        limit={limits.monthlyVoiceMinutes}
        detail={`${account.voiceMinutesUsed} trên ${limits.monthlyVoiceMinutes} phút, ${resets}`}
      />
      <p className="soft">Đọc bản gốc không giới hạn.</p>
      <div className="mt-4 flex max-w-120 flex-col items-start gap-1.5">
        <Link className="primary" to="/plans">
          Xem các gói
        </Link>
        {account.isSuperAdmin && (
          <Link className="ink-link" to="/admin">
            Quản trị
          </Link>
        )}
        <Button
          quiet
          onClick={async () => {
            await signOut()
            queryClient.clear()
            window.location.assign('/login')
          }}
        >
          Đăng xuất
        </Button>
      </div>
    </>
  )
}
