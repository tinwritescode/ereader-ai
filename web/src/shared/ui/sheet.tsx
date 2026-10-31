import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/** A sheet from the right of a wide window, from the bottom of a narrow one. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    if (node && !node.open) node.showModal()
    return () => node?.close()
  }, [])
  return (
    // The click only closes on the backdrop; the keyboard's way out is Escape, through onCancel.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialog}
      className="sheet"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
    >
      <div className="sheet-body">{children}</div>
    </dialog>
  )
}
