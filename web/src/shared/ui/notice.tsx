import { AnimatePresence, m } from 'motion/react'
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
      <div
        className="fixed right-4 bottom-25 z-40 flex max-w-[min(420px,calc(100vw-32px))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {shown.map(({ id, text, action }) => (
            <m.div
              key={id}
              className="flex items-center justify-between gap-3 rounded-[10px] bg-plum px-3.5 py-2.5 text-sm text-white"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <span>{text}</span>
              {action && (
                <button
                  type="button"
                  className="min-h-8 font-semibold whitespace-nowrap text-butter"
                  onClick={() => {
                    dismiss(id)
                    action.run()
                  }}
                >
                  {action.label}
                </button>
              )}
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </NoticeContext>
  )
}
