import type { Speaker } from '../domain/controller'
import { fetchClip } from '../data/speech'

// Half a second of silence: playing it inside a tap lets later clips play without one (Safari).
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='

/** Plays clips through one reused audio element, so a browser that wants a tap first gets it once. */
export function createAudioSpeaker(): Speaker<string> & { unlock: () => void } {
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
      player.src = SILENCE
      void player.play().catch(() => {})
    },
    synthesize: async (sentence) => URL.createObjectURL(await fetchClip(sentence)),
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
        player.play().catch(failed)
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
