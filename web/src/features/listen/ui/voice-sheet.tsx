import { useQuery } from '@tanstack/react-query'
import { Sheet } from '~/shared/ui/sheet'
import type { Voice } from '../domain/controller'
import { useListening } from './listen-provider'

export function VoiceSheet({
  current,
  onChoose,
  onClose,
}: {
  current: Voice | null
  onChoose: (voice: Voice) => void
  onClose: () => void
}) {
  const { source } = useListening()
  const { data: voices = [] } = useQuery(source.voices)
  return (
    <Sheet title="Chọn giọng đọc" onClose={onClose}>
      <h2 className="sheet-heading">Chọn giọng đọc</h2>
      {source.spendsMinutes && <p className="soft">Giọng qua mạng, tính vào phút của gói</p>}
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
