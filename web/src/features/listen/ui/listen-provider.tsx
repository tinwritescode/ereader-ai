import { useQueryClient } from '@tanstack/react-query'
import { createContext, use, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { createStored } from '~/shared/ui/stored'
import { ListenController } from '../domain/controller'
import type { Heard, ListenState } from '../domain/controller'
import { voicesQuery } from '../data/speech'
import { createAudioSpeaker } from './audio-speaker'

const choice = createStored({
  key: 'listen.choice',
  schema: z.object({ voiceCode: z.string(), rate: z.number() }).nullable(),
  fallback: null,
})

type Listening = { controller: ListenController<string>; unlock: () => void }
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
export function ListenProvider({ onHeard, children }: { onHeard: (heard: Heard) => void; children: ReactNode }) {
  const queryClient = useQueryClient()
  const [listening] = useState((): Listening => {
    const speaker = createAudioSpeaker()
    const controller = new ListenController({
      speaker,
      voices: () => queryClient.ensureQueryData(voicesQuery()),
      choice: { load: choice.read, save: choice.write },
      onHeard: (heard) => onHeard(heard),
    })
    return { controller, unlock: speaker.unlock }
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
