import { Ruler } from '~/shared/ui/ruler'
import { Sheet } from '~/shared/ui/sheet'
import { SPACING_NAMES, TEXT_SIZES } from '../domain/look'
import type { ReadingLook } from '../domain/look'
import { readingLook } from './stores'

const SIZES: ReadingLook['size'][] = ['small', 'medium', 'large']
const SPACINGS: ReadingLook['spacing'][] = ['tight', 'normal', 'loose']
const TICKS = [0, 0.5, 1]

export function LookSheet({ onClose }: { onClose: () => void }) {
  const look = readingLook.useValue()
  const change = (next: Partial<ReadingLook>) => readingLook.write({ ...look, ...next })
  return (
    <Sheet title="Trang giấy" onClose={onClose}>
      <b>Cỡ chữ</b>
      <Ruler
        label="Cỡ chữ"
        selectedId={look.size}
        ticks={TICKS}
        stops={SIZES.map((size, index) => ({
          id: size,
          fraction: TICKS[index] ?? 0,
          name: `Chữ cỡ ${index + 1}`,
          label: <span style={{ fontSize: TEXT_SIZES[size] + index * 2 }}>A</span>,
        }))}
        onChoose={(id) => change({ size: SIZES.find((size) => size === id) ?? look.size })}
      />
      <b>Giãn dòng</b>
      <Ruler
        label="Giãn dòng"
        selectedId={look.spacing}
        ticks={TICKS}
        stops={SPACINGS.map((spacing, index) => ({
          id: spacing,
          fraction: TICKS[index] ?? 0,
          label: <small>{SPACING_NAMES[spacing]}</small>,
        }))}
        onChoose={(id) => change({ spacing: SPACINGS.find((spacing) => spacing === id) ?? look.spacing })}
      />
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
