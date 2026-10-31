import { useEffect, useState } from 'react'

/** A place in the chapter the reader pointed at, and where on screen. */
export type PickedSpot = { block: number; offset: number; x: number; y: number }

function spotIn({ node, at, x, y }: { node: Node; at: number; x: number; y: number }): PickedSpot | null {
  const element = node instanceof Element ? node : node.parentElement
  const holder = element?.closest<HTMLElement>('.text:not(.faded) [data-block]')
  if (!holder) return null
  const before = document.createRange()
  before.setStart(holder, 0)
  before.setEnd(node, at)
  return { block: Number(holder.dataset['block']), offset: before.toString().length, x, y }
}

function spotOfSelection(): PickedSpot | null {
  const selection = document.getSelection()
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.rangeCount) return null
  const { left, top } = selection.getRangeAt(0).getBoundingClientRect()
  const start = selection.getRangeAt(0)
  return spotIn({ node: start.startContainer, at: start.startOffset, x: left, y: top })
}

function spotAtPoint({ x, y }: { x: number; y: number }): PickedSpot | null {
  const caret = document.caretPositionFromPoint?.(x, y)
  if (caret) return spotIn({ node: caret.offsetNode, at: caret.offset, x, y })
  const range = document.caretRangeFromPoint?.(x, y)
  return range ? spotIn({ node: range.startContainer, at: range.startOffset, x, y }) : null
}

/** Selecting text or right-clicking it picks a sentence. A plain click never starts the voice. */
export function usePickedSpot(enabled: boolean): { picked: PickedSpot | null; clear: () => void } {
  const [picked, setPicked] = useState<PickedSpot | null>(null)
  useEffect(() => {
    if (!enabled) return undefined
    const onSelection = () => {
      const spot = spotOfSelection()
      if (spot) setPicked(spot)
    }
    const onMenu = (event: MouseEvent) => {
      const spot = spotAtPoint({ x: event.clientX, y: event.clientY })
      if (!spot) return
      event.preventDefault()
      setPicked(spot)
    }
    document.addEventListener('selectionchange', onSelection)
    document.addEventListener('contextmenu', onMenu)
    return () => {
      document.removeEventListener('selectionchange', onSelection)
      document.removeEventListener('contextmenu', onMenu)
    }
  }, [enabled])
  return {
    picked: enabled ? picked : null,
    clear: () => {
      document.getSelection()?.removeAllRanges()
      setPicked(null)
    },
  }
}
