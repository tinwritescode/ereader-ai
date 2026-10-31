import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Stands in for NestJS and WorkOS in browser tests. Speaks the backend's wire names. */

const PORT = Number(process.env['STUB_PORT'] ?? 4010)
const PLANS = {
  free: { books: 3, monthlyDigests: 10, monthlyVbeeMinutes: 30, maxFileBytes: 1, chapterVoice: false, monthlyBookTranslations: 0 },
  plus: { books: 30, monthlyDigests: 100, monthlyVbeeMinutes: 300, maxFileBytes: 1, chapterVoice: false, monthlyBookTranslations: 0 },
  max: { books: 200, monthlyDigests: 500, monthlyVbeeMinutes: 1500, maxFileBytes: 1, chapterVoice: true, monthlyBookTranslations: 3 },
}

type Task = Record<string, unknown> & { id: string; state: string; progress: number }

const manyChapters = Array.from({ length: 400 }, (_, index) => ({
  chapterId: `long-${index + 1}`,
  index,
  label: `Chương ${index + 1}`,
  subtitle: null,
  wordCount: 1000,
  minutes: 12,
}))

const bookOf = (bookId: string, title: string, author: string | null, language: string | null, chapterCount: number, hasCover = false) => ({
  bookId,
  status: 'ready',
  title,
  author,
  language,
  hasCover,
  chapterCount,
  minutes: chapterCount * 10,
})

// Refresh tokens are single use in the backend, so no two tests may share one.
let tests = 0

function fresh() {
  tests += 1
  return {
    access: 'access-1',
    refresh: `refresh-${tests}-1`,
    tokenCount: 1,
    refreshCalls: 0,
    refreshInvalid: false,
    plan: 'max',
    role: 'super_admin',
    requestedPlan: null as string | null,
    planRequestDelay: 0,
    planRequestFails: false,
    digestsUsed: 3,
    digestFails: null as string | null,
    voiceUsed: 12,
    speechLimit: false,
    speechDelay: 0,
    speechCalls: [] as string[],
    uploads: [] as string[],
    uploadFails: null as string | null,
    uploadExpireOnce: false,
    translated: new Set<string>(),
    translationReady: false,
    books: [
      bookOf('deep', 'Deep Work', 'Cal Newport', 'en', 3, true),
      bookOf('viet', 'Cuộc chiến sinh tồn', 'Suzanne Collins', 'vi', 3),
      bookOf('long', 'Sách rất dài', null, 'vi', 400),
    ],
    tasks: { voice: [] as Task[], translation: [] as Task[], book: [] as Task[] },
    accounts: [
      { id: 'a1', email: 'reader@example.com', role: 'user', plan: 'free', requestedPlan: 'plus', usage: { digests: 2, vbeeSeconds: 0, bookTranslations: 0 } },
      { id: 'a2', email: 'boss@example.com', role: 'super_admin', plan: 'max', requestedPlan: null, usage: { digests: 9, vbeeSeconds: 0, bookTranslations: 0 } },
    ],
  }
}

let state = fresh()

const chapters = (bookId: string) =>
  bookId === 'long'
    ? manyChapters
    : ['Một', 'Hai', 'Ba'].map((name, index) => ({
        chapterId: `${bookId}-${index + 1}`,
        index,
        label: `Chương ${name}`,
        subtitle: `Tên chương ${index + 1}`,
        wordCount: 1000,
        minutes: index === 2 ? 3 : 12,
      }))

const blocks = (chapterId: string) => [
  { kind: 'heading', text: `Đầu chương ${chapterId}` },
  { kind: 'paragraph', text: `Câu thứ nhất của ${chapterId}. Câu thứ hai rất ngắn. Câu thứ ba kết thúc đoạn.` },
  ...Array.from({ length: 40 }, (_, index) => ({ kind: 'paragraph', text: `Đoạn ${index + 1} kể tiếp câu chuyện. Nó có hai câu.` })),
]

/** A short tone, so a browser has something real to decode and finish. */
function wav(seconds = 0.35): Buffer {
  const rate = 8000
  const samples = Math.floor(rate * seconds)
  const out = Buffer.alloc(44 + samples * 2)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + samples * 2, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(rate, 24)
  out.writeUInt32LE(rate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36)
  out.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index += 1) {
    out.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / rate) * 8000), 44 + index * 2)
  }
  return out
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

const body = (request: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks)))
  })

function send(response: ServerResponse, status: number, value?: unknown): void {
  response.writeHead(status, value === undefined ? {} : { 'content-type': 'application/json' })
  response.end(value === undefined ? undefined : JSON.stringify(value))
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function advance(tasks: Task[]): void {
  for (const task of tasks) {
    if (task['state'] === 'queued') {
      task['state'] = 'running'
      task['position'] = null
    } else if (task['state'] === 'running') {
      task.progress += 50
      task['percent'] = Math.min(task.progress, 100)
      task['done'] = task.progress >= 100 ? task['total'] : 1
      if (task.progress >= 100) {
        task['state'] = 'done'
        task['current'] = null
        task['waiting'] = []
        task['finishedAt'] = new Date().toISOString()
      }
    }
  }
}

function wholeBookTask(kind: 'bookTranslation' | 'bookVoice', bookId: string, voice: { code: string; name: string } | null): Task {
  const book = state.books.find((entry) => entry.bookId === bookId)
  const id = `task-${kind}-${bookId}-${Date.now()}`
  return {
    id,
    kind,
    bookId,
    bookTitle: book?.title ?? '',
    state: 'running',
    code: null,
    done: 0,
    total: 3,
    percent: 10,
    progress: 0,
    position: null,
    current: { chapterId: `${bookId}-1`, percent: 40 },
    waiting: [`${bookId}-1`, `${bookId}-2`, `${bookId}-3`],
    ...(voice ? { voiceCode: voice.code, voiceName: voice.name, voiced: [] } : {}),
    createdAt: new Date().toISOString(),
    finishedAt: null,
  }
}

const VOICES = [
  { code: 'hat-de', name: 'Hạt Dẻ', gender: 'female' },
  { code: 'nam-an', name: 'Nam An', gender: 'male' },
]

function authed(request: IncomingMessage): boolean {
  return request.headers.authorization === `Bearer ${state.access}`
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`)
  const path = url.pathname
  const method = request.method ?? 'GET'
  const json = async <T>(): Promise<T> => JSON.parse((await body(request)).toString() || '{}')

  if (path === '/__stub/reset') {
    state = fresh()
    return send(response, 204)
  }
  if (path === '/__stub/set') {
    Object.assign(state, await json<object>())
    return send(response, 204)
  }
  if (path === '/__stub/expire') {
    state.tokenCount += 1
    state.access = `access-${state.tokenCount}`
    return send(response, 204)
  }
  if (path === '/__stub/state') {
    return send(response, 200, { refreshCalls: state.refreshCalls, speechCalls: state.speechCalls, uploads: state.uploads, requestedPlan: state.requestedPlan, accounts: state.accounts })
  }
  if (path === '/__stub/task') {
    const { kind, ...task } = await json<{ kind: 'voice' | 'translation' | 'book' } & Task>()
    state.tasks[kind].push(task)
    return send(response, 204)
  }
  if (path === '/user_management/authorize') {
    const target = new URL(url.searchParams.get('redirect_uri') ?? '')
    target.searchParams.set('code', 'good-code')
    target.searchParams.set('state', url.searchParams.get('state') ?? '')
    response.writeHead(302, { location: target.toString() })
    return void response.end()
  }
  if (path === '/auth/token' && method === 'POST') {
    const { code, codeVerifier } = await json<{ code: string; codeVerifier: string }>()
    if (code !== 'good-code' || !codeVerifier) return send(response, 401, { code: 'SIGN_IN_FAILED' })
    return send(response, 200, { accessToken: state.access, refreshToken: state.refresh })
  }
  if (path === '/auth/refresh' && method === 'POST') {
    state.refreshCalls += 1
    const { refreshToken } = await json<{ refreshToken: string }>()
    if (state.refreshInvalid) return send(response, 401, { code: 'SIGN_IN_REQUIRED' })
    if (refreshToken === 'spent') return send(response, 401, { code: 'SIGN_IN_REQUIRED' })
    state.refresh = `refresh-${tests}-${state.tokenCount}`
    return send(response, 200, { accessToken: state.access, refreshToken: state.refresh })
  }
  const cover = /^\/books\/([^/]+)\/cover$/.exec(path)
  if (cover) {
    response.writeHead(200, { 'content-type': 'image/png' })
    return void response.end(PNG)
  }
  if (!authed(request)) return send(response, 401, { code: 'SIGN_IN_REQUIRED' })

  if (path === '/me') {
    return send(response, 200, {
      email: 'reader@example.com',
      role: state.role,
      plan: state.plan,
      requestedPlan: state.requestedPlan,
      usage: { digests: state.digestsUsed, vbeeMinutes: state.voiceUsed, bookTranslations: 1 },
      resetsOn: '2026-12-01T00:00:00.000Z',
      plans: PLANS,
    })
  }
  if (path === '/me/plan-request' && method === 'POST') {
    const { plan } = await json<{ plan: string }>()
    await sleep(state.planRequestDelay)
    if (state.planRequestFails) return send(response, 500, { code: 'PLAN_REQUEST_FAILED' })
    state.requestedPlan = plan
    return send(response, 204)
  }
  if (path === '/admin/accounts') return send(response, 200, { accounts: state.accounts })
  const admin = /^\/admin\/accounts\/([^/]+)$/.exec(path)
  if (admin && method === 'PATCH') {
    const { plan } = await json<{ plan: string }>()
    const account = state.accounts.find((entry) => entry.id === admin[1])
    if (account) account.plan = plan
    return send(response, 200, account)
  }
  if (path === '/books' && method === 'GET') return send(response, 200, state.books)
  if (path === '/books' && method === 'POST') {
    if (state.uploadExpireOnce) {
      state.uploadExpireOnce = false
      await body(request)
      state.tokenCount += 1
      state.access = `access-${state.tokenCount}`
      return send(response, 401, { code: 'SIGN_IN_REQUIRED' })
    }
    const sent = await body(request)
    if (state.uploadFails) return send(response, 429, { code: state.uploadFails })
    const name = /filename="([^"]+)"/.exec(sent.toString('utf8'))?.[1] ?? 'book.epub'
    state.uploads.push(name)
    const book = bookOf(`up-${state.uploads.length}`, name.replace(/\.epub$/, ''), null, 'vi', 3)
    state.books = [book, ...state.books]
    return send(response, 202, book)
  }
  const bookChapters = /^\/books\/([^/]+)\/chapters$/.exec(path)
  if (bookChapters?.[1]) return send(response, 200, { bookId: bookChapters[1], chapters: chapters(bookChapters[1]) })
  const translationOfBook = /^\/books\/([^/]+)\/translation$/.exec(path)
  if (translationOfBook?.[1] && method === 'GET') {
    const bookId = translationOfBook[1]
    return send(response, 200, {
      translated: [...state.translated].filter((id) => id.startsWith(bookId)),
      task: state.tasks.translation.findLast((task) => task['bookId'] === bookId) ?? null,
    })
  }
  if (translationOfBook?.[1] && method === 'POST') {
    const task = wholeBookTask('bookTranslation', translationOfBook[1], null)
    state.tasks.translation.push(task)
    return send(response, 200, task)
  }
  const voiceOfBook = /^\/books\/([^/]+)\/voice$/.exec(path)
  if (voiceOfBook?.[1] && method === 'GET') {
    const bookId = voiceOfBook[1]
    return send(response, 200, { chapters: 3, skipped: 0, minutes: 34, task: state.tasks.book.findLast((task) => task['bookId'] === bookId) ?? null })
  }
  if (voiceOfBook?.[1] && method === 'POST') {
    const { voiceCode } = await json<{ voiceCode: string }>()
    const voice = VOICES.find((entry) => entry.code === voiceCode) ?? VOICES[0]
    const task = wholeBookTask('bookVoice', voiceOfBook[1], voice ?? null)
    state.tasks.book.push(task)
    return send(response, 200, task)
  }
  const translation = /^\/chapters\/([^/]+)\/translation$/.exec(path)
  if (translation?.[1]) {
    if (!state.translationReady) return send(response, 409, { code: 'TRANSLATION_NOT_READY' })
    return send(response, 200, {
      chapterId: translation[1],
      blocks: blocks(translation[1]).map(({ kind, text }) => ({ kind, text: `Bản dịch: ${text}` })),
    })
  }
  const digest = /^\/chapters\/([^/]+)\/digest$/.exec(path)
  if (digest?.[1] && method === 'POST') {
    if (state.digestFails) return send(response, 429, { code: state.digestFails })
    const { targetMinutes } = await json<{ targetMinutes: number }>()
    return send(response, 200, { cacheKey: 'x', targetWords: 100, content: `Bản ${targetMinutes} phút của ${digest[1]}.\n\nĐoạn thứ hai.`, cached: false })
  }
  const chapter = /^\/chapters\/([^/]+)$/.exec(path)
  if (chapter?.[1]) return send(response, 200, { chapterId: chapter[1], bookId: 'x', index: 0, label: 'x', subtitle: null, wordCount: 1, minutes: 1, blocks: blocks(chapter[1]) })
  if (path === '/speech/voices') return send(response, 200, { voices: VOICES })
  if (path === '/speech' && method === 'POST') {
    const { text } = await json<{ text: string }>()
    if (state.speechLimit) return send(response, 429, { code: 'VBEE_LIMIT' })
    state.speechCalls.push(text)
    await sleep(state.speechDelay)
    response.writeHead(200, { 'content-type': 'audio/wav' })
    return void response.end(wav())
  }
  if (path === '/speech/tasks' && method === 'POST') {
    const job = await json<Record<string, unknown> & { sentences: string[] }>()
    const task: Task = { ...job, id: `task-chapter-${Date.now()}`, kind: 'chapterVoice', voiceName: 'Hạt Dẻ', state: 'running', code: null, done: 1, total: job.sentences.length, position: null, progress: 0, createdAt: new Date().toISOString(), finishedAt: null }
    state.tasks.voice.push(task)
    return send(response, 200, task)
  }
  if (path === '/speech/tasks') {
    advance(state.tasks.voice)
    return send(response, 200, { tasks: state.tasks.voice })
  }
  if (path === '/translations/tasks') {
    advance(state.tasks.translation)
    return send(response, 200, { tasks: state.tasks.translation })
  }
  if (path === '/voices/tasks') {
    advance(state.tasks.book)
    return send(response, 200, { tasks: state.tasks.book })
  }
  const task = /^\/(speech\/tasks|translations\/tasks|voices\/tasks)\/([^/]+)(?:\/(resume|first))?$/.exec(path)
  if (task) {
    const list = task[1] === 'speech/tasks' ? 'voice' : task[1] === 'translations/tasks' ? 'translation' : 'book'
    const found = state.tasks[list].find((entry) => entry.id === task[2])
    if (method === 'DELETE') {
      state.tasks[list] = state.tasks[list].filter((entry) => entry.id !== task[2])
      return send(response, 204)
    }
    if (task[3] === 'first' && found) found['current'] = { chapterId: (await json<{ chapterId: string }>()).chapterId, percent: 0 }
    if (task[3] === 'resume' && found) {
      found['state'] = 'running'
      found['code'] = null
    }
    return send(response, 200, found)
  }
  send(response, 404, { code: 'NOT_FOUND' })
}

createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`)
    send(response, 500, { code: 'STUB_FAILED' })
  })
}).listen(PORT, () => process.stdout.write(`stub on ${PORT}\n`))
