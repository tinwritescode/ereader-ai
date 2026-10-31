export const HOME_TITLE = 'eReader: đọc và nghe sách theo thời gian bạn có'

/** What a browser tab shows: the page first, since the app's name cuts off in a narrow tab. */
export const pageTitle = (...names: string[]) => `${names.filter(Boolean).join(', ')} – eReader`
