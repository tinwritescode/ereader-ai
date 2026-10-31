import { Link, useRouter } from '@tanstack/react-router'
import { codeOf, errorMessage } from '~/features/books/domain/words'
import { Button } from '~/shared/ui/button'

export function PageFailed({ error }: { error: unknown }) {
  const router = useRouter()
  return (
    <div className="centred-page">
      <p className="failure">{`Không mở được trang này. ${errorMessage(codeOf(error))}`}</p>
      <Button onClick={() => void router.invalidate()}>Thử lại</Button>
      <Link className="ink-link" to="/">
        Về thư viện
      </Link>
    </div>
  )
}

export function PageMissing() {
  return (
    <div className="centred-page">
      <p className="soft">Không tìm thấy trang này.</p>
      <Link className="primary" to="/">
        Về thư viện
      </Link>
    </div>
  )
}
