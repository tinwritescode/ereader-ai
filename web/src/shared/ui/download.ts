/** The name a server gives a file in its Content-Disposition, the UTF-8 form first. */
export function fileNameOf(disposition: string | null): string | null {
  if (!disposition) return null
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      return null
    }
  }
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null
}

/** The code a failed answer carries in its JSON body, or none when it carries no such body. */
async function failureCode(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  return typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
    ? body.code
    : 'NETWORK_ERROR'
}

/**
 * Fetches a file and hands it to the browser to keep, under the name the server gives it, so the page can
 * show that it is working until the file is in hand. A failed answer throws an Error carrying its code.
 */
export async function saveFrom(url: string, fallbackName: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(await failureCode(response))
  const href = URL.createObjectURL(await response.blob())
  const link = Object.assign(document.createElement('a'), {
    href,
    download: fileNameOf(response.headers.get('content-disposition')) ?? fallbackName,
  })
  document.body.append(link)
  link.click()
  link.remove()
  // The browser reads the file after the click returns; give it a moment before letting go.
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}
