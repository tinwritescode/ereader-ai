import { createContext, use, useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type Notice = { text: string; action?: { label: string; run: () => void } }
type Shown = Notice & { id: number }

const SHOWN_MS = 8000
const NoticeContext = createContext<(notice: Notice) => void>(() => {})

export const useNotice = () => use(NoticeContext)

/** The app's short messages, announced to screen readers as they come. */
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown[]>([])
  const next = useRef(0)
  const dismiss = useCallback((id: number) => setShown((all) => all.filter((notice) => notice.id !== id)), [])
  const show = useCallback(
    (notice: Notice) => {
      next.current += 1
      const id = next.current
      setShown((all) => [...all, { ...notice, id }])
      setTimeout(() => dismiss(id), SHOWN_MS)
    },
    [dismiss],
  )
  const value = useMemo(() => show, [show])
  return (
    <NoticeContext value={value}>
      {children}
      <div className="notices" role="status" aria-live="polite">
        {shown.map(({ id, text, action }) => (
          <div key={id} className="notice">
            <span>{text}</span>
            {action && (
              <button
                type="button"
                onClick={() => {
                  dismiss(id)
                  action.run()
                }}
              >
                {action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </NoticeContext>
  )
}
