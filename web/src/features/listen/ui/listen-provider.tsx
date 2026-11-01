import { useQueryClient } from '@tanstack/react-query'
import type { UseQueryOptions } from '@tanstack/react-query'
import { createContext, use, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { createStored } from '~/shared/ui/stored'
import { ListenController } from '../domain/controller'
import type { Heard, ListenState, Voice } from '../domain/controller'
import { fetchClip, voicesQuery } from '../data/speech'
import { createAudioSpeaker } from './audio-speaker'

const choice = createStored({
  key: 'listen.choice',
  schema: z.object({ voiceCode: z.string(), rate: z.number() }).nullable(),
  fallback: null,
})

/** Where the voices and their audio come from. */
export type VoiceSource = {
  voices: UseQueryOptions<Voice[], Error, Voice[], string[]>
  clip: (sentence: { text: string; voiceCode: string }) => Promise<Blob>
  /** Whether listening takes from the listener's own plan. */
  spendsMinutes: boolean
}

const ACCOUNT_VOICES: VoiceSource = {
  voices: voicesQuery(),
  clip: (sentence) => fetchClip(sentence),
  spendsMinutes: true,
}

type Listening = { controller: ListenController<string>; unlock: () => void; source: VoiceSource }
const ListenContext = createContext<Listening | null>(null)

export function useListening(): Listening {
  const listening = use(ListenContext)
  if (!listening) throw new Error('ListenProvider is missing')
  return listening
}

export function useListenState(): ListenState {
  const { controller } = useListening()
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
}

/** One voice for the whole app, so it keeps reading while the reader moves between pages. */
export function ListenProvider({
  onHeard,
  source = ACCOUNT_VOICES,
  children,
}: {
  onHeard: (heard: Heard) => void
  source?: VoiceSource
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const [listening] = useState((): Listening => {
    const speaker = createAudioSpeaker(source.clip)
    const controller = new ListenController({
      speaker,
      voices: () => queryClient.ensureQueryData(source.voices),
      choice: { load: choice.read, save: choice.write },
      onHeard: (heard) => onHeard(heard),
    })
    return { controller, unlock: speaker.unlock, source }
  })
  // Any first tap or key lets audio play later without one.
  useEffect(() => {
    const unlock = () => listening.unlock()
    document.addEventListener('pointerdown', unlock, { once: true, capture: true })
    document.addEventListener('keydown', unlock, { once: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true })
      document.removeEventListener('keydown', unlock, { capture: true })
      listening.controller.stop()
    }
  }, [listening])
  return <ListenContext value={listening}>{children}</ListenContext>
}
