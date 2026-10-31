import { InMemoryTaskTable, TaskTable } from '../../../shared/tasks/task-table';
import { BookVoiceTask } from '../domain/book-voice';

export const BOOK_VOICE_STORE = Symbol('BOOK_VOICE_STORE');

export type BookVoiceStore = TaskTable<BookVoiceTask>;

/** For development and tests: forgotten on restart. */
export class InMemoryBookVoiceStore extends InMemoryTaskTable<BookVoiceTask> {}
