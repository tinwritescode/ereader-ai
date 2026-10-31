import { describe, expect, it, vi } from 'vitest'
import type { TextBlock } from '~/features/books/domain/book'
import { ListenController } from './controller'
import type { Heard, ListenSource, Speaker, Voice } from './controller'

const VOICES: Voice[] = [
  { code: 'one', name: 'Một', gender: 'female' },
  { code: 'two', name: 'Hai', gender: 'male' },
]
const source: ListenSource = { bookId: 'b', bookTitle: 'Sách', chapterId: 'c', chapterLabel: 'Chương Một', option: { length: 'original', minutes: 10 }, next: null }
const SENTENCES = ['Câu một.', 'Câu hai.', 'Câu ba.', 'Câu bốn.', 'Câu năm.', 'Câu sáu.', 'Câu bảy.']
const blocks: TextBlock[] = [{ kind: 'paragraph', text: SENTENCES.join(' ') }]

const flush = () => vi.advanceTimersByTimeAsync(1)

function setup({ failing = new Set<string>(), held = false }: { failing?: Set<string>; held?: boolean } = {}) {
  const played: string[] = []
  const asked: string[] = []
  const heard: Heard[] = []
  const log: string[] = []
  const holds: (() => void)[] = []
  let finish: (() => void) | undefined
  const speaker: Speaker<string> = {
    synthesize: ({ text, voiceCode }) => {
      asked.push(`${voiceCode}:${text}`)
      if (failing.has(text)) return Promise.reject(new Error('SPEECH_FAILED'))
      if (held) return new Promise((resolve) => holds.push(() => resolve(text)))
      return Promise.resolve(text)
    },
    play: (clip) => {
      played.push(clip)
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    pause: async () => void log.push('pause'),
    resume: async () => void log.push('resume'),
    stop: async () => {
      finish?.()
      finish = undefined
    },
    setRate: async (rate) => void log.push(`rate:${rate}`),
  }
  const controller = new ListenController({
    speaker,
    voices: async () => VOICES,
    choice: { load: () => null, save: (saved) => log.push(`saved:${saved.voiceCode}:${saved.rate}`) },
    onHeard: (entry) => heard.push(entry),
  })
  const finishClip = async () => {
    finish?.()
    await flush()
  }
  return { controller, played, asked, heard, log, holds, finishClip, start: async (block = 0, offset = 0) => { controller.request({ blocks, source, block, offset }); await flush() } }
}

const useTimers = () => {
  vi.useFakeTimers()
}

describe('listening', () => {
  it('reads every sentence in turn, then stops at the end', async () => {
    useTimers()
    const { controller, played, heard, finishClip, start } = setup()
    await start()
    expect(controller.state.stage).toMatchObject({ kind: 'playing', index: 0, total: 7, paused: false })
    for (const _ of SENTENCES) await finishClip()
    expect(played).toEqual(SENTENCES)
    expect(controller.state).toMatchObject({ stage: { kind: 'off' }, done: 1 })
    expect(heard.at(-1)).toEqual({ kind: 'finished', source })
  })

  it('starts at the sentence holding the given place', async () => {
    useTimers()
    const { played, start } = setup()
    await start(0, SENTENCES[0]!.length + 2)
    expect(played).toEqual(['Câu hai.'])
  })

  it('says where it is on each sentence', async () => {
    useTimers()
    const { heard, finishClip, start } = setup()
    await start()
    await finishClip()
    expect(heard.map((entry) => entry.kind === 'sentence' && entry.sentence.text)).toEqual(['Câu một.', 'Câu hai.'])
  })

  it('pauses mid sentence and goes on from it', async () => {
    useTimers()
    const { controller, log, start } = setup()
    await start()
    controller.togglePause()
    await flush()
    expect(controller.state.stage).toMatchObject({ kind: 'playing', paused: true })
    controller.togglePause()
    await flush()
    expect(log.filter((entry) => entry === 'pause' || entry === 'resume')).toEqual(['pause', 'resume'])
  })

  it('skips by sentence, stopping at the ends', async () => {
    useTimers()
    const { controller, played, start } = setup()
    await start()
    controller.skip(2)
    await flush()
    controller.skip(-9)
    await flush()
    expect(played).toEqual(['Câu một.', 'Câu ba.', 'Câu một.'])
  })

  it('goes round the rates and keeps the choice', async () => {
    useTimers()
    const { controller, log, start } = setup()
    await start()
    controller.cycleRate()
    await flush()
    expect(controller.state.rate).toBe(1.25)
    expect(log).toContain('rate:1.25')
    expect(log).toContain('saved:one:1.25')
    for (const _ of [1, 2, 3]) controller.cycleRate()
    expect(controller.state.rate).toBe(1)
  })

  it('a new voice picks up at the same sentence, with no old audio', async () => {
    useTimers()
    const { controller, asked, played, finishClip, start } = setup()
    await start()
    await finishClip()
    controller.chooseVoice(VOICES[1]!)
    await flush()
    expect(asked.at(-1)?.startsWith('two:')).toBe(true)
    expect(asked).toContain('two:Câu hai.')
    expect(played.at(-1)).toBe('Câu hai.')
    expect(controller.state.voice?.code).toBe('two')
  })

  it('stopping leaves nothing playing, and an old run stays quiet', async () => {
    useTimers()
    const { controller, played, start, finishClip } = setup()
    await start()
    controller.stop()
    await flush()
    await finishClip()
    expect(controller.state).toMatchObject({ stage: { kind: 'off' }, done: 0 })
    expect(played).toEqual(['Câu một.'])
  })

  it('reports a failure on the first sentence', async () => {
    useTimers()
    const { controller, start } = setup({ failing: new Set(['Câu một.']) })
    await start()
    expect(controller.state.stage).toEqual({ kind: 'failed', code: 'SPEECH_FAILED' })
  })

  it('still reads what came before a failed sentence', async () => {
    useTimers()
    const { controller, played, finishClip, start } = setup({ failing: new Set(['Câu ba.']) })
    await start()
    await finishClip()
    await finishClip()
    expect(played).toEqual(['Câu một.', 'Câu hai.'])
    expect(controller.state.stage).toEqual({ kind: 'failed', code: 'SPEECH_FAILED' })
  })

  it('asks for at most four sentences at once', async () => {
    useTimers()
    const { asked, start } = setup({ held: true })
    await start()
    expect(asked).toHaveLength(4)
  })

  it('counts sentences ready before speaking, and says when it is slow', async () => {
    useTimers()
    const { controller, holds, start } = setup({ held: true })
    await start()
    expect(controller.state.stage).toEqual({ kind: 'preparing', ready: 0, needed: 5, slow: false })
    await vi.advanceTimersByTimeAsync(8000)
    expect(controller.state.stage).toMatchObject({ kind: 'preparing', slow: true })
    holds[0]?.()
    await flush()
    expect(controller.state.stage).toMatchObject({ kind: 'preparing', ready: 1, slow: false })
  })

  it('has nothing to read without a voice', async () => {
    useTimers()
    const controller = new ListenController<string>({
      speaker: { synthesize: async () => '', play: async () => {}, pause: async () => {}, resume: async () => {}, stop: async () => {}, setRate: async () => {} },
      voices: async () => [],
      choice: { load: () => null, save: () => {} },
      onHeard: () => {},
    })
    controller.request({ blocks, source, block: 0, offset: 0 })
    await flush()
    expect(controller.state.stage).toEqual({ kind: 'failed', code: 'SPEECH_UNAVAILABLE' })
  })
})
