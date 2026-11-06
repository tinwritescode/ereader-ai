import type { TextBlock } from '~/features/books/domain/book'
import { codeOf } from '~/features/books/domain/words'
import type { LengthOption } from '~/features/reading/domain/length'
import { planSpeech, sentenceAt, sentencesWithin } from './speech-plan'
import type { SpokenSentence } from './speech-plan'

export const RATES = [1, 1.25, 1.5, 0.8]
// Voices take seconds per sentence, so a thin buffer runs dry: keep a minute of speech ready.
const READ_AHEAD_SECONDS = 60
// Enough to outrun playback; the rest wait for a free slot.
const REQUESTS_AT_ONCE = 4
// Sentences ready before it speaks, at the start and whenever it runs dry.
const START_SENTENCES = 5
// A wait this long with nothing back means the voice service is starting from zero.
const SLOW_AFTER_MS = 8000

export type Voice = { code: string; name: string; gender: string }

export type ListenSource = {
  bookId: string
  bookTitle: string
  chapterId: string
  chapterLabel: string
  option: LengthOption
  next: { chapterId: string; chapterLabel: string; minutes: number } | null
}

export type ListenStage =
  | { kind: 'off' }
  /** `ready` of `needed` sentences; `needed` is 0 when nothing is being counted. */
  | { kind: 'preparing'; ready: number; needed: number; slow: boolean }
  | { kind: 'playing'; sentence: SpokenSentence; index: number; total: number; paused: boolean }
  | { kind: 'failed'; code: string }

export type ListenState = {
  stage: ListenStage
  voice: Voice | null
  rate: number
  /** Share of the chapter's sentences already read, from 0 to 1. */
  done: number
  source: ListenSource | null
}

export type Heard =
  | { kind: 'sentence'; source: ListenSource; sentence: SpokenSentence; done: number; voice: Voice }
  | { kind: 'finished'; source: ListenSource }

export type ListenChoice = { voiceCode: string; rate: number }

/** The sound itself. `play` settles when the clip ends or `stop` is called. */
export type Speaker<Clip> = {
  synthesize: (args: { text: string; voiceCode: string }) => Promise<Clip>
  play: (clip: Clip) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
  setRate: (rate: number) => Promise<void>
}

type Deps<Clip> = {
  speaker: Speaker<Clip>
  voices: () => Promise<Voice[]>
  choice: { load: () => ListenChoice | null; save: (choice: ListenChoice) => void }
  onHeard: (heard: Heard) => void
}

type Request = { blocks: readonly TextBlock[]; source: ListenSource; block: number; offset: number }

const quietly = () => {}

/** Reads a chapter aloud sentence by sentence, whichever page is showing. */
export class ListenController<Clip> {
  state: ListenState = { stage: { kind: 'off' }, voice: null, rate: 1, done: 0, source: null }

  private readonly deps: Deps<Clip>
  private readonly listeners = new Set<() => void>()
  private voiceSettled = false
  private blocks: readonly TextBlock[] = []
  private plan: SpokenSentence[] = []
  private audio = new Map<number, Promise<Clip>>()
  private ready = new Set<number>()
  private playhead: number | null = null
  private running = 0
  // Each run owns one generation; a newer one makes an older run stop by itself.
  private generation = 0
  private current = 0
  private paused = false
  private unpause: (() => void) | null = null

  constructor(deps: Deps<Clip>) {
    this.deps = deps
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = () => this.state

  /** The sentences as the voice asks for them, so stored audio is found later. */
  get sentences(): string[] {
    return this.plan.map(({ text }) => text)
  }

  /** What the voice is on, whichever page shows; null when it is off. */
  get heard(): ListenSource | null {
    return this.state.stage.kind === 'off' ? null : this.state.source
  }

  request = ({ blocks, source, block, offset }: Request): void => {
    void this.begin({ blocks, source, block, offset })
  }

  private async begin({ blocks, source, block, offset }: Request): Promise<void> {
    if (blocks !== this.blocks) {
      this.blocks = blocks
      this.plan = planSpeech(blocks)
      this.forgetAudio()
      this.playhead = null
    }
    if (this.plan.length === 0) return
    const from = sentenceAt({ plan: this.plan, block, offset })
    const asked = this.claim()
    this.set({ source, stage: { kind: 'preparing', ready: 0, needed: 0, slow: false } })
    if (!(await this.settleVoice()) || asked !== this.generation) return
    await this.deps.speaker.stop()
    this.start(from)
  }

  private claim(): number {
    this.generation += 1
    return this.generation
  }

  /** False when there is no voice to read with. */
  private async settleVoice(): Promise<boolean> {
    if (this.voiceSettled && this.state.voice) return true
    try {
      const offered = await this.deps.voices()
      const saved = this.deps.choice.load()
      const voice = offered.find(({ code }) => code === saved?.voiceCode) ?? offered[0]
      if (!voice) {
        this.set({ stage: { kind: 'failed', code: 'SPEECH_UNAVAILABLE' } })
        return false
      }
      this.voiceSettled = true
      this.set({ voice, rate: saved && RATES.includes(saved.rate) ? saved.rate : this.state.rate })
      return true
    } catch (error) {
      this.set({ stage: { kind: 'failed', code: codeOf(error) } })
      return false
    }
  }

  private start(index: number): void {
    const generation = this.claim()
    this.current = index
    this.paused = false
    this.release()
    this.set({ stage: { kind: 'preparing', ready: 0, needed: 0, slow: false } })
    void this.run(generation, index)
  }

  private async run(generation: number, from: number): Promise<void> {
    const { speaker } = this.deps
    try {
      await speaker.setRate(this.state.rate)
      for (let index = from; index < this.plan.length; index += 1) {
        const clip = this.synthesized(index)
        this.playhead = index
        this.fetchAhead()
        if (index === from || !this.ready.has(index)) await this.buffer(generation, index)
        const audio = await clip
        if (generation !== this.generation) return
        // Shown before waiting: a pause that lands between sentences must leave a way to go on.
        this.reached(index)
        if (this.paused) await new Promise<void>((resolve) => (this.unpause = resolve))
        if (generation !== this.generation) return
        await speaker.play(audio)
        if (generation !== this.generation) return
        this.audio.delete(index)
        this.ready.delete(index)
      }
      await speaker.stop()
      this.ended()
    } catch (error) {
      if (generation !== this.generation) return
      await speaker.stop()
      this.set({ stage: { kind: 'failed', code: codeOf(error) } })
    }
  }

  /** Waits until sentences from `index` are ready in a row. One failing past the first ends the wait: what came before it can still be heard. */
  private async buffer(generation: number, index: number): Promise<void> {
    const end = Math.min(index + START_SENTENCES, this.plan.length)
    const needed = end - index
    const wanted = Array.from({ length: needed }, (_, ahead) => index + ahead)
    if (wanted.every((sentence) => this.ready.has(sentence))) return
    this.current = index
    const report = (ready: number, slow = false) => {
      if (generation === this.generation) this.set({ stage: { kind: 'preparing', ready, needed, slow } })
    }
    report(0)
    const slow = setTimeout(() => report(0, true), SLOW_AFTER_MS)
    try {
      for (const sentence of wanted) {
        try {
          await this.synthesized(sentence)
        } catch (error) {
          if (sentence === index) throw error
          return
        }
        clearTimeout(slow)
        if (generation !== this.generation) return
        report(sentence - index + 1)
      }
    } finally {
      clearTimeout(slow)
    }
  }

  /** Fills the minute after the playhead, nearest sentence first. Runs whenever a request ends, so a free slot goes to whatever is needed by then. */
  private fetchAhead(): void {
    const { playhead } = this
    if (playhead === null) return
    // A faster rate spends the same audio in less time.
    const seconds = READ_AHEAD_SECONDS * this.state.rate
    const last = playhead + sentencesWithin({ plan: this.plan, from: playhead, seconds })
    for (let index = playhead + 1; index <= last && index < this.plan.length; index += 1) {
      if (this.running >= REQUESTS_AT_ONCE) return
      if (!this.audio.has(index)) this.synthesized(index)
    }
  }

  private synthesized(index: number): Promise<Clip> {
    const kept = this.audio.get(index)
    if (kept) return kept
    const { voice } = this.state
    const sentence = this.plan[index]
    if (!voice || !sentence) return Promise.reject(new Error('SPEECH_FAILED'))
    const { audio, ready } = this
    this.running += 1
    const job = this.deps.speaker.synthesize({ text: sentence.text, voiceCode: voice.code })
    audio.set(index, job)
    job.then(
      () => {
        this.running -= 1
        ready.add(index)
        this.fetchAhead()
      },
      () => {
        this.running -= 1
        // Not kept: the sentence is asked for again when the voice reaches it.
        audio.delete(index)
      },
    )
    return job
  }

  private reached(index: number): void {
    const sentence = this.plan[index]
    const { source, voice } = this.state
    if (!sentence || !source || !voice) return
    this.current = index
    const done = index / this.plan.length
    this.set({ stage: { kind: 'playing', sentence, index, total: this.plan.length, paused: this.paused }, done })
    this.deps.onHeard({ kind: 'sentence', source, sentence, done, voice })
  }

  private ended(): void {
    this.set({ stage: { kind: 'off' }, done: 1 })
    if (this.state.source) this.deps.onHeard({ kind: 'finished', source: this.state.source })
  }

  togglePause = (): void => {
    const { stage } = this.state
    if (stage.kind !== 'playing') return
    this.paused = !this.paused
    this.set({ stage: { ...stage, paused: this.paused } })
    if (this.paused) {
      void this.deps.speaker.pause().catch(quietly)
    } else {
      this.release()
      void this.deps.speaker.resume().catch(quietly)
    }
  }

  skip = (sentences: number): void => {
    if (this.state.stage.kind !== 'playing') return
    this.restartAt(Math.min(Math.max(this.current + sentences, 0), this.plan.length - 1))
  }

  /** Tries again from where it stopped. */
  retry = (): void => {
    this.restartAt(this.current)
  }

  private restartAt(index: number): void {
    this.claim()
    void this.deps.speaker.stop().then(() => this.start(index))
  }

  cycleRate = (): void => {
    const rate = RATES[(RATES.indexOf(this.state.rate) + 1) % RATES.length] ?? 1
    this.set({ rate })
    this.remember()
    void this.deps.speaker.setRate(rate).catch(quietly)
  }

  chooseVoice = (voice: Voice): void => {
    this.voiceSettled = true
    this.set({ voice })
    this.forgetAudio()
    this.remember()
    if (this.state.stage.kind !== 'off') this.restartAt(this.current)
  }

  stop = (): void => {
    this.claim()
    this.playhead = null
    this.release()
    this.forgetAudio()
    void this.deps.speaker.stop().catch(quietly)
    this.set({ stage: { kind: 'off' }, done: 0 })
  }

  /** Voices offered to choose from, loading the saved choice if nothing has played yet. */
  offered = async (): Promise<Voice[]> => {
    await this.settleVoice()
    return this.deps.voices()
  }

  private remember(): void {
    const { voice, rate } = this.state
    if (voice) this.deps.choice.save({ voiceCode: voice.code, rate })
  }

  private release(): void {
    this.unpause?.()
    this.unpause = null
  }

  private forgetAudio(): void {
    this.audio = new Map()
    this.ready = new Set()
  }

  private set(change: Partial<ListenState>): void {
    this.state = { ...this.state, ...change }
    this.listeners.forEach((listener) => listener())
  }
}
