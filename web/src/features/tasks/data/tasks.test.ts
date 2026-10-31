import { expect, it } from 'vitest'
import { TaskWire } from './tasks'

const task = {
  id: 't',
  kind: 'bookVoice',
  bookId: 'b',
  bookTitle: 'S',
  state: 'stopped',
  code: 'VBEE_LIMIT',
  position: null,
  createdAt: 'x',
  finishedAt: null,
  done: 1,
  total: 3,
  percent: 36,
  current: null,
  waiting: [],
  voiceCode: 'v',
  voiceName: 'V',
  voiced: [],
}

it('reads a stop for lack of minutes without the provider name', () => {
  expect(TaskWire.parse(task).code).toBe('VOICE_LIMIT')
})

it('refuses a task kind it does not know', () => {
  expect(TaskWire.safeParse({ ...task, kind: 'other' }).success).toBe(false)
})
