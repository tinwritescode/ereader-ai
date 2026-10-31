import { useSyncExternalStore } from 'react'
import type { z } from 'zod'

type Stored<T> = { read: () => T; write: (value: T) => void; useValue: () => T }

/** A value kept on this device, read through its schema. */
export function createStored<Schema extends z.ZodType>({
  key,
  schema,
  fallback,
}: {
  key: string
  schema: Schema
  fallback: z.output<Schema>
}): Stored<z.output<Schema>> {
  let raw: string | null = null
  let value = fallback
  const listeners = new Set<() => void>()
  const read = () => {
    const now = localStorage.getItem(key)
    if (now !== raw) {
      raw = now
      value = parsed(now)
    }
    return value
  }
  const parsed = (text: string | null): z.output<Schema> => {
    if (text === null) return fallback
    try {
      const result = schema.safeParse(JSON.parse(text))
      return result.success ? result.data : fallback
    } catch {
      return fallback
    }
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    window.addEventListener('storage', listener)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', listener)
    }
  }
  return {
    read,
    write: (next) => {
      localStorage.setItem(key, JSON.stringify(next))
      listeners.forEach((listener) => listener())
    },
    useValue: () => useSyncExternalStore(subscribe, read, () => fallback),
  }
}
