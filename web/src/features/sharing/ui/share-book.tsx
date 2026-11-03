import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { codeOf, errorMessage } from '~/features/books/domain/words'
import { Button } from '~/shared/ui/button'
import { LetterCat } from '~/shared/ui/critters'
import { Sheet } from '~/shared/ui/sheet'
import { TILE, TileFace } from '~/shared/ui/tile'
import { createShare, revokeShare, sharesQuery } from '../data/shares'

const FIELD = 'min-h-11 w-full rounded-lg border-2 border-ink bg-paper px-3 text-ink'

function ShareSheet({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const shares = useQuery(sharesQuery(bookId))
  const [password, setPassword] = useState('')
  // The token cannot be asked for again, so the link lives only as long as this sheet.
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: sharesQuery(bookId).queryKey })
  const create = useMutation({
    mutationFn: () => createShare({ data: { bookId, password } }),
    onSuccess: ({ token }) => {
      setLink(`${window.location.origin}/s/${token}`)
      setCopied(false)
      setPassword('')
      return refresh()
    },
  })
  const revoke = useMutation({
    mutationFn: (shareId: string) => revokeShare({ data: { shareId } }),
    onSuccess: refresh,
  })
  const failure = create.error ?? revoke.error
  return (
    <>
      <h2 className="sheet-call">Chia sẻ sách này</h2>
      <p className="soft">
        Người nhận chỉ đọc được, không sửa được. Mỗi link dùng trên một máy: máy đầu tiên nhập đúng mật khẩu giữ link,
        mọi máy khác bị từ chối.
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
          Mật khẩu cho người nhận
          <input
            className={FIELD}
            type="text"
            autoComplete="off"
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" className="primary" disabled={create.isPending}>
          Tạo link
        </button>
      </form>
      {failure && <p className="failure">{errorMessage(codeOf(failure))}</p>}
      {link && (
        <>
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            Link chia sẻ
            <input className={FIELD} type="text" readOnly value={link} onFocus={(event) => event.target.select()} />
          </label>
          <p className="soft">Link chỉ hiện lần này. Gửi link và mật khẩu riêng cho người nhận.</p>
          <Button
            quiet
            onClick={() => {
              void navigator.clipboard.writeText(link).then(() => setCopied(true))
            }}
          >
            {copied ? 'Đã chép' : 'Chép link'}
          </Button>
        </>
      )}
      {shares.data && shares.data.length > 0 && (
        <ul className="flex flex-col gap-1">
          {shares.data.map(({ shareId, createdAt, opened }) => (
            <li key={shareId} className="flex items-center justify-between gap-3 text-sm text-ink">
              <span>
                {new Date(createdAt).toLocaleDateString('vi-VN')}, {opened ? 'Đã khóa vào một máy' : 'Chưa ai mở'}
              </span>
              <Button quiet disabled={revoke.isPending} onClick={() => revoke.mutate(shareId)}>
                Thu hồi
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button quiet onClick={onClose}>
        Đóng
      </Button>
    </>
  )
}

export function ShareBook({ bookId }: { bookId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={TILE} onClick={() => setOpen(true)}>
        <TileFace critter={<LetterCat mood="idle" />} title="Chia sẻ" note="Gửi link kèm mật khẩu" />
      </button>
      {open && (
        <Sheet title="Chia sẻ sách" onClose={() => setOpen(false)}>
          <ShareSheet bookId={bookId} onClose={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  )
}
