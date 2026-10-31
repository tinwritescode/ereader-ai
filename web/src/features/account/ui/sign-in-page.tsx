import { errorMessage } from '~/features/books/domain/words'

/** The links are full page loads: sign-in leaves the app for WorkOS. */
export function SignInPage({ failure }: { failure: string | undefined }) {
  return (
    <div className="centred-page">
      <div className="mb-4 rounded-[14px] border-2 border-ink bg-sheet p-3.5 text-left [&>div]:flex [&>div]:items-baseline [&>div]:gap-1.5 [&>div]:border-b [&>div]:border-rule [&_small]:text-[11.5px] [&_small]:text-muted [&_span]:font-hand [&_span]:text-[20px] [&_span]:text-ink">
        <div>
          <small>Sách</small>
          <span>eReader AI</span>
        </div>
        <div>
          <small>Dành cho</small>
          <span>người ít thời gian</span>
        </div>
      </div>
      {failure && <p className="failure">Chưa đăng nhập được. {errorMessage(failure)}</p>}
      <a className="primary" href="/auth/start">
        Đăng nhập
      </a>
      <a className="ink-link" href="/auth/start?screen=sign-up">
        Tạo tài khoản
      </a>
      <p className="soft">Sách và chỗ đang đọc đi theo tài khoản của bạn.</p>
    </div>
  )
}
