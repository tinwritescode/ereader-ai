import { useQuery } from '@tanstack/react-query'
import { Sheet } from '~/shared/ui/sheet'
import type { Voice } from '../domain/controller'
import { voicesQuery } from '../data/speech'

export function VoiceSheet({
  current,
  onChoose,
  onClose,
}: {
  current: Voice | null
  onChoose: (voice: Voice) => void
  onClose: () => void
}) {
  const { data: voices = [] } = useQuery(voicesQuery())
  return (
    <Sheet title="Chọn giọng đọc" onClose={onClose}>
      <h2>Chọn giọng đọc</h2>
      <p className="soft">Giọng qua mạng, tính vào phút của gói</p>
      <div role="radiogroup" aria-label="Giọng đọc">
        {voices.map((voice) => (
          <button
            key={voice.code}
            type="button"
            role="radio"
            className="voice-row"
            aria-checked={voice.code === current?.code}
            onClick={() => {
              onChoose(voice)
              onClose()
            }}
          >
            {voice.name}
            {voice.code === current?.code && <small>đang dùng</small>}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
