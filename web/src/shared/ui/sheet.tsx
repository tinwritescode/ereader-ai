import { m } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const fromSide = () => typeof window === 'undefined' || window.matchMedia('(width >= 721px)').matches

/** A sheet from the right of a wide window, from the bottom of a narrow one. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [closing, setClosing] = useState(false)
  const [hidden] = useState(() => (fromSide() ? { x: 48, opacity: 0 } : { y: 48, opacity: 0 }))
  useEffect(() => {
    const node = dialog.current
    if (node && !node.open) node.showModal()
    return () => node?.close()
  }, [])
  return (
    // The click only closes on the backdrop; the keyboard's way out is Escape, through onCancel.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <m.dialog
      ref={dialog}
      className="fixed inset-x-0 top-auto bottom-0 m-0 h-auto max-h-[90dvh] w-full max-w-full overflow-auto rounded-t-3xl bg-sheet p-0 text-text backdrop:bg-[rgb(30_26_58/0.32)] md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-dvh md:w-105 md:rounded-l-3xl md:rounded-tr-none"
      aria-label={title}
      initial={hidden}
      animate={closing ? hidden : { x: 0, y: 0, opacity: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onAnimationComplete={() => {
        if (closing) onClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        setClosing(true)
      }}
      onClick={(event) => {
        if (event.target === dialog.current) setClosing(true)
      }}
    >
      <div className="flex flex-col gap-2 p-5 md:p-line">{children}</div>
    </m.dialog>
  )
}
