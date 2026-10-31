import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

const sheetTop = (top: number): CSSProperties & { '--sheet-top': string } => ({ '--sheet-top': `${top}px` })

/** A popover beside what opened it on a wide page, a sheet from the bottom on a phone. */
export function Sheet({
  title,
  top,
  onClose,
  children,
}: {
  title: string
  top?: number
  onClose: () => void
  children: ReactNode
}) {
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
      style={top === undefined ? undefined : sheetTop(top)}
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
