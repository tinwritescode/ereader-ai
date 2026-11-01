export function failureWords(code: string): { title: string; text: string } {
  if (code === 'VOICE_LIMIT') return { title: 'Hết phút giọng qua mạng', text: 'Tháng này đã dùng hết.' }
  if (code === 'NETWORK_ERROR' || code === 'SPEECH_UNAVAILABLE')
    return { title: 'Chưa gọi được giọng qua mạng', text: 'Kiểm tra mạng rồi thử lại.' }
  return { title: 'Chưa đọc được đoạn này', text: 'Thử lại, hoặc chọn giọng khác.' }
}

export function preparingLine({ ready, needed, slow }: { ready: number; needed: number; slow: boolean }): string {
  if (slow) return 'Máy đọc đang khởi động'
  return needed === 0 ? 'Đang chuẩn bị giọng đọc' : `Đã có ${ready} trên ${needed} câu`
}

export const startingLine = (voice: string) => `${voice} bắt đầu đọc.`

export const rateLabel = (rate: number) => `${String(rate).replace('.', ',')}x`
