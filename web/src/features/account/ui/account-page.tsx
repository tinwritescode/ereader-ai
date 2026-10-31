import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '~/shared/ui/button'
import { limitsOf, planLabel, resetLabel } from '../domain/account'
import { signOut } from '../data/account'
import { useAccount } from './with-account'

function Meter({ name, used, limit, detail }: { name: string; used: number; limit: number; detail: string }) {
  return (
    <div className="meter">
      <b>{name}</b>
      <span
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
      >
        <i style={{ width: `${limit === 0 ? 0 : Math.min(100, (used * 100) / limit)}%` }} />
      </span>
      <small>{detail}</small>
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
      <p className="hand" style={{ fontSize: 24, margin: '10px 0' }}>{`Gói ${planLabel(account.plan)}`}</p>
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
      <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
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
