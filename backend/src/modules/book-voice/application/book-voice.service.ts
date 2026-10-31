import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AccountSlots } from '../../../shared/tasks/account-slots';
import { ChapterInLine, chapterLine } from '../../../shared/tasks/chapter-line';
import { TaskEdits } from '../../../shared/tasks/task-edits';
import { AccountService } from '../../accounts/application/account.service';
import { Account, PLANS } from '../../accounts/domain/plan';
import { BookService } from '../../books/application/book.service';
import { Block, BookRecord } from '../../books/domain/book';
import { stoppedBy } from '../../speech/application/chapter-voice.service';
import { SpeechService } from '../../speech/application/speech.service';
import { TTS_GATEWAY, TtsGateway } from '../../speech/application/tts-gateway';
import { spokenSeconds } from '../../speech/domain/cloud-voice';
import { planSpeech, spokenMinutes } from '../../speech/domain/speech-plan';
import { CHAPTER_TRANSLATIONS, ChapterTranslations } from '../../translation/application/translation-stores';
import { BookVoiceTask } from '../domain/book-voice';
import { BOOK_VOICE_STORE, BookVoiceStore } from './book-voice-store';

// The voice service batches sixteen streams; two tasks share them.
const SENTENCES_AT_ONCE = 8;
// Progress is saved this often: a chapter has hundreds of sentences and each save rewrites the task.
const SAVE_EVERY_SENTENCES = 16;
const FINISHED_KEPT_MS = 7 * 24 * 60 * 60 * 1_000;

type Run = { cancelled: boolean };

const isForeign = ({ language }: Pick<BookRecord, 'language'>) => !!language && !language.toLowerCase().startsWith('vi');

/** Works through whole-book voice tasks in this process; the single backend instance owns them all. */
@Injectable()
export class BookVoiceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BookVoiceService.name);
  private readonly runs = new Map<string, Run>();
  private readonly edits: TaskEdits<BookVoiceTask>;

  constructor(
    @Inject(BOOK_VOICE_STORE) private readonly store: BookVoiceStore,
    @Optional() @Inject(TTS_GATEWAY) private readonly tts: TtsGateway | null,
    @Inject(CHAPTER_TRANSLATIONS) private readonly translations: ChapterTranslations,
    private readonly speech: SpeechService,
    private readonly books: BookService,
    private readonly accounts: AccountService,
    private readonly slots: AccountSlots,
  ) {
    this.edits = new TaskEdits(store);
  }

  async onApplicationBootstrap(): Promise<void> {
    for (const task of await this.store.unfinished()) {
      await this.store.save({ ...task, state: { kind: 'queued' }, current: null });
      this.enqueue(task, task.createdAt);
    }
  }

  async create(
    account: Account,
    bookId: string,
    { voiceCode, startChapterId }: { voiceCode: string; startChapterId: string | null },
  ): Promise<BookVoiceTask> {
    if (!PLANS[account.plan].chapterVoice) throw new ForbiddenException({ code: 'PLAN_REQUIRED' });
    if (!this.tts) throw new ServiceUnavailableException({ code: 'SPEECH_UNAVAILABLE' });
    const voice = (await this.tts.voices()).find(({ code }) => code === voiceCode);
    if (!voice) throw new BadRequestException({ code: 'VOICE_UNKNOWN' });
    const book = await this.books.status(account.id, bookId);

    const earlier = (await this.store.ofAccount(account.id)).find(
      (task) => task.bookId === bookId && task.voiceCode === voiceCode && task.state.kind !== 'done',
    );
    if (earlier) return earlier.state.kind === 'stopped' ? this.resume(account, earlier.id) : earlier;

    const { readable } = await this.readable(account, book);
    const remaining = chapterLine({ chapters: readable.map(({ chapter }) => chapter), startAt: startChapterId, skip: [] });
    if (remaining.length === 0) throw new ConflictException({ code: 'NOTHING_TO_VOICE' });

    const task: BookVoiceTask = {
      id: randomUUID(),
      accountId: account.id,
      bookId,
      bookTitle: book.title,
      voiceCode,
      voiceName: voice.name,
      source: isForeign(book) ? 'translation' : 'original',
      remaining,
      voiced: [],
      current: null,
      state: { kind: 'queued' },
      createdAt: new Date(),
      finishedAt: null,
    };
    await this.store.save(task);
    this.enqueue(task, task.createdAt);
    return task;
  }

  async list(account: Account, now = new Date()): Promise<BookVoiceTask[]> {
    const tasks = await this.store.ofAccount(account.id);
    return tasks.filter(({ finishedAt }) => !finishedAt || now.getTime() - finishedAt.getTime() < FINISHED_KEPT_MS);
  }

  /** Place in the account's line of long tasks, from 1; null unless queued. */
  position(task: BookVoiceTask): number | null {
    return this.slots.position(task.id);
  }

  /** What a voice for the whole book would read, and the newest task for it. */
  async ofBook(account: Account, bookId: string) {
    const book = await this.books.status(account.id, bookId);
    const { readable, skipped } = await this.readable(account, book);
    const tasks = (await this.list(account)).filter((task) => task.bookId === bookId);
    return {
      chapters: readable.length,
      skipped,
      minutes: spokenMinutes(readable.flatMap(({ blocks }) => planSpeech(blocks))),
      task: tasks.at(-1) ?? null,
    };
  }

  /** Stops the task and forgets it; what was read stays stored, and nothing more is charged. */
  async cancel(account: Account, id: string): Promise<void> {
    await this.owned(account, id);
    const run = this.runs.get(id);
    if (run) run.cancelled = true;
    this.slots.withdraw(id);
    await this.edits.serially(id, () => this.store.remove(id));
  }

  /** Goes on from the chapter it stopped in; sentences already stored are not charged again. */
  async resume(account: Account, id: string): Promise<BookVoiceTask> {
    const task = await this.owned(account, id);
    if (task.state.kind !== 'stopped') return task;
    const queued = await this.edits.edit(task, (current) => ({ ...current, state: { kind: 'queued' }, finishedAt: null }));
    if (!queued) throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
    this.enqueue(queued, new Date());
    return queued;
  }

  private async owned(account: Account, id: string): Promise<BookVoiceTask> {
    const task = (await this.store.ofAccount(account.id)).find((candidate) => candidate.id === id);
    if (!task) throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
    return task;
  }

  /** The chapters a Vietnamese voice can read, with their text, and how many it cannot yet. */
  private async readable(account: Account, book: BookRecord) {
    const chapters = await this.books.chapters(account.id, book.id);
    const texts = await Promise.all(
      chapters.map(async ({ id, label, wordCount, blocks }) => ({
        chapter: { chapterId: id, label, words: wordCount } satisfies ChapterInLine,
        blocks: isForeign(book) ? await this.translations.find(id) : blocks,
      })),
    );
    const readable = texts.flatMap(({ chapter, blocks }) => (blocks ? [{ chapter, blocks }] : []));
    return { readable, skipped: chapters.length - readable.length };
  }

  private enqueue(task: BookVoiceTask, queuedAt: Date): void {
    this.slots.enqueue({ id: task.id, accountId: task.accountId, queuedAt, run: () => this.work(task) });
  }

  private async work(queued: BookVoiceTask): Promise<void> {
    const run: Run = { cancelled: false };
    this.runs.set(queued.id, run);
    try {
      let task = await this.edits.edit(queued, (current) => ({ ...current, state: { kind: 'running' } }));
      while (task && !run.cancelled && task.remaining.length > 0) {
        const [head] = task.remaining;
        await this.readChapter(task, head, run);
        if (run.cancelled) return;
        task = await this.edits.edit(task, (current) => ({
          ...current,
          remaining: current.remaining.filter(({ chapterId }) => chapterId !== head.chapterId),
          voiced: [...current.voiced, head],
          current: null,
        }));
      }
      if (task && !run.cancelled) {
        await this.edits.edit(task, (current) => ({ ...current, state: { kind: 'done' }, finishedAt: new Date() }));
      }
    } catch (error) {
      if (!run.cancelled) await this.stop(queued, error);
    } finally {
      this.runs.delete(queued.id);
    }
  }

  private async stop(task: Pick<BookVoiceTask, 'id' | 'accountId'>, error: unknown): Promise<void> {
    try {
      await this.edits.edit(task, (current) => ({ ...current, state: stoppedBy(error), current: null, finishedAt: new Date() }));
    } catch {
      this.logger.warn(`Book voice task ${task.id} could not be stopped cleanly`);
    }
  }

  private async blocksOf(task: BookVoiceTask, chapterId: string): Promise<Block[]> {
    const blocks =
      task.source === 'translation'
        ? await this.translations.find(chapterId)
        : (await this.books.chapter(task.accountId, chapterId)).blocks;
    if (!blocks) throw new NotFoundException({ code: 'TRANSLATION_NOT_READY' });
    return blocks;
  }

  private async readChapter(task: BookVoiceTask, head: ChapterInLine, run: Run): Promise<void> {
    const account = await this.accounts.byId(task.accountId);
    const tts = this.tts;
    if (!account || !tts) throw new Error('voice unavailable');
    const sentences = planSpeech(await this.blocksOf(task, head.chapterId));
    const parts = Math.max(sentences.length, 1);
    await this.edits.edit(task, (current) => ({ ...current, current: { done: 0, parts } }));
    let done = 0;
    await this.speech.speakAll({
      tts,
      sentences,
      voiceCode: task.voiceCode,
      charge: (text) => this.accounts.charge(account, 'vbeeSeconds', spokenSeconds(text)),
      atOnce: SENTENCES_AT_ONCE,
      stopped: () => run.cancelled,
      onSpoken: async () => {
        done += 1;
        if (done % SAVE_EVERY_SENTENCES === 0) {
          const saved = done;
          await this.edits.edit(task, (current) => ({ ...current, current: { done: saved, parts } }));
        }
      },
    });
  }
}
