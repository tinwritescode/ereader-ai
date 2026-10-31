import { Sheet } from '~/shared/ui/sheet'
import { SPACING_NAMES, TEXT_SIZES } from '../domain/look'
import type { ReadingLook } from '../domain/look'
import { readingLook } from './stores'

const SIZES: ReadingLook['size'][] = ['small', 'medium', 'large']
const SPACINGS: ReadingLook['spacing'][] = ['tight', 'normal', 'loose']

export function LookSheet({ onClose }: { onClose: () => void }) {
  const look = readingLook.useValue()
  const change = (next: Partial<ReadingLook>) => readingLook.write({ ...look, ...next })
  return (
    <Sheet title="Trang giấy" onClose={onClose}>
      <b>Cỡ chữ</b>
      <div className="ruler" role="radiogroup" aria-label="Cỡ chữ">
        {SIZES.map((size, index) => (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={look.size === size}
            aria-label={`Chữ cỡ ${index + 1}`}
            style={{ fontSize: TEXT_SIZES[size] + index * 2 }}
            onClick={() => change({ size })}
          >
            A
          </button>
        ))}
      </div>
      <b>Giãn dòng</b>
      <div className="ruler" role="radiogroup" aria-label="Giãn dòng">
        {SPACINGS.map((spacing) => (
          <button
            key={spacing}
            type="button"
            role="radio"
            aria-checked={look.spacing === spacing}
            onClick={() => change({ spacing })}
          >
            <small>{SPACING_NAMES[spacing]}</small>
          </button>
        ))}
      </div>
      <b>Trang giấy</b>
      <div className="paper-choice">
        <button
          type="button"
          className="day"
          aria-pressed={look.paper === 'day'}
          onClick={() => change({ paper: 'day' })}
        >
          Giấy
          <small>Ban ngày</small>
        </button>
        <button
          type="button"
          className="dark"
          aria-pressed={look.paper === 'night'}
          onClick={() => change({ paper: 'night' })}
        >
          Đêm
          <small>Giảm chói khi tối</small>
        </button>
      </div>
    </Sheet>
  )
}
