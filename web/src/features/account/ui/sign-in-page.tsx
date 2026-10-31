import { errorMessage } from '~/features/books/domain/words'

/** The links are full page loads: sign-in leaves the app for WorkOS. */
export function SignInPage({ failure }: { failure: string | undefined }) {
  return (
    <div className="sign-in">
      <div className="label">
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
