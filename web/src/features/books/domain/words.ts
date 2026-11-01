/** "45 phút", "1 giờ", "9 giờ 17 phút". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`
}

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  EPUB_INVALID: 'File này không phải EPUB hợp lệ.',
  UNSUPPORTED_TYPE: 'Chỉ hỗ trợ file .epub.',
  FILE_TOO_LARGE: 'File lớn hơn 100 MB.',
  PLAN_FILE_TOO_LARGE: 'File lớn hơn mức của gói này.',
  BOOK_LIMIT: 'Đã đủ số sách của gói này.',
  DIGEST_LIMIT: 'Hết lượt rút gọn tháng này.',
  NETWORK_ERROR: 'Không kết nối được máy chủ.',
  DIGEST_FAILED: 'AI chưa rút gọn được chương này.',
  SHARE_TAKEN: 'Link này đã được mở trên một máy khác.',
  SHARE_GONE: 'Link này không còn dùng được.',
  SHARE_PASSWORD_WRONG: 'Sai mật khẩu.',
  SHARE_PASSWORD_INVALID: 'Mật khẩu cần ít nhất 6 ký tự.',
}

export function errorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? `Máy chủ báo lỗi ${code}.`
}

const CODE = /^[A-Z][A-Z0-9_]*$/

/** The backend's stable code a failed call carries across the server function. */
export function codeOf(error: unknown): string {
  return error instanceof Error && CODE.test(error.message) ? error.message : 'NETWORK_ERROR'
}
