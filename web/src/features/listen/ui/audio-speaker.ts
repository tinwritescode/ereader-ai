import type { Speaker } from '../domain/controller'

const RATE = 8000
const SILENT_SAMPLES = RATE / 10

/** A tenth of a second of silence: playing it inside a tap lets later clips play without one (Safari). */
function silence(): string {
  const wav = new DataView(new ArrayBuffer(44 + SILENT_SAMPLES * 2))
  const text = (at: number, value: string) =>
    [...value].forEach((letter, index) => wav.setUint8(at + index, letter.charCodeAt(0)))
  text(0, 'RIFF')
  wav.setUint32(4, 36 + SILENT_SAMPLES * 2, true)
  text(8, 'WAVEfmt ')
  wav.setUint32(16, 16, true)
  wav.setUint16(20, 1, true)
  wav.setUint16(22, 1, true)
  wav.setUint32(24, RATE, true)
  wav.setUint32(28, RATE * 2, true)
  wav.setUint16(32, 2, true)
  wav.setUint16(34, 16, true)
  text(36, 'data')
  wav.setUint32(40, SILENT_SAMPLES * 2, true)
  return URL.createObjectURL(new Blob([wav.buffer], { type: 'audio/wav' }))
}

/** Plays clips through one reused audio element, so a browser that wants a tap first gets it once. */
export function createAudioSpeaker(
  clip: (sentence: { text: string; voiceCode: string }) => Promise<Blob>,
): Speaker<string> & { unlock: () => void } {
  let element: HTMLAudioElement | null = null
  let rate = 1
  let finish: (() => void) | null = null
  let unlocked = false
  const audio = () => (element ??= new Audio())
  const settle = () => {
    finish?.()
    finish = null
  }
  return {
    unlock: () => {
      if (unlocked) return
      unlocked = true
      const player = audio()
      player.src = silence()
      void player.play().catch(() => {})
    },
    synthesize: async (sentence) => URL.createObjectURL(await clip(sentence)),
    play: (url) =>
      new Promise((resolve, reject) => {
        const player = audio()
        settle()
        const done = () => {
          player.removeEventListener('ended', done)
          player.removeEventListener('error', failed)
          finish = null
          URL.revokeObjectURL(url)
          resolve()
        }
        const failed = () => {
          player.removeEventListener('ended', done)
          player.removeEventListener('error', failed)
          finish = null
          reject(new Error('SPEECH_FAILED'))
        }
        finish = done
        player.addEventListener('ended', done)
        player.addEventListener('error', failed)
        player.src = url
        // Setting src resets the rate in some browsers.
        player.playbackRate = rate
        // A pause or stop landing before playback begins aborts play(); that is no failure (WebKit).
        player.play().catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) failed()
        })
      }),
    pause: async () => audio().pause(),
    resume: async () => {
      // Between sentences there is nothing to go on with: the next clip starts by itself.
      if (finish) await audio().play()
    },
    stop: async () => {
      audio().pause()
      settle()
    },
    setRate: async (next) => {
      rate = next
      audio().playbackRate = next
    },
  }
}
