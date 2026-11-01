import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LLM_GATEWAY, LlmCompletionRequest, LlmGateway } from '../../../shared/llm/llm-gateway';
import { mapInBatches } from '../../../shared/map-in-batches';
import { countWords } from '../../../shared/reading-time';
import { AccountSlots } from '../../../shared/tasks/account-slots';
import { ChapterInLine, chapterLine } from '../../../shared/tasks/chapter-line';
import { TaskEdits } from '../../../shared/tasks/task-edits';
import { AccountService } from '../../accounts/application/account.service';
import { Account, PLANS } from '../../accounts/domain/plan';
import { BookService } from '../../books/application/book.service';
import { Block } from '../../books/domain/book';
import {
  BookTranslationTask,
  partsOf,
  passagesFrom,
  putFirst,
} from '../domain/book-translation';
import {
  StyleSheet,
  StyleSheetSchema,
  TRANSLATION_PROMPT_VERSION,
  TranslationOutputSchema,
  editingInstructions,
  styleSheetInstructions,
  translationInstructions,
} from './translation-prompt';
import {
  BOOK_TRANSLATION_STORE,
  BookTranslationStore,
  CHAPTER_TRANSLATIONS,
  ChapterTranslations,
  STYLE_SHEETS,
  StyleSheets,
} from './translation-stores';

// About 2k tokens of English per call: small enough to come back whole, large enough to keep the context.
const PART_WORDS = 1_200;
// Editing sends a part's English and its draft together, with the style sheet.
const MAX_INPUT_TOKENS = 60_000;
const PARTS_AT_ONCE = 4;
// How much of the book the style sheet is written from.
const SHEET_WORDS = 8_000;
const SHEET_OUTPUT_TOKENS = 12_000;
// Enough of what came before to keep pronouns and tone going across a part's edge.
const BLOCKS_CARRIED = 6;
// A model that drops or merges a block gets two more tries before the task stops.
const TRIES = 3;
const FINISHED_KEPT_MS = 7 * 24 * 60 * 60 * 1_000;

type Run = { cancelled: boolean };
type TaskRef = Pick<BookTranslationTask, 'id' | 'accountId'>;

/** Works through book translations in this process; the single backend instance owns them all. */
@Injectable()
export class BookTranslationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BookTranslationService.name);
  private readonly runs = new Map<string, Run>();
  private readonly edits: TaskEdits<BookTranslationTask>;

  constructor(
    @Inject(BOOK_TRANSLATION_STORE) private readonly store: BookTranslationStore,
    @Inject(CHAPTER_TRANSLATIONS) private readonly translations: ChapterTranslations,
    @Inject(STYLE_SHEETS) private readonly sheets: StyleSheets,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGateway,
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
    // In the background: a large shelf must not hold up the server starting.
    void this.books
      .reshapeStale(({ id, userId }) => this.forgetBook(userId, id))
      .catch((error: unknown) => this.logger.warn(`Books could not be read again: ${String(error)}`));
  }

  /** The book turned out to need no translating: nothing was delivered, so a held charge goes back. */
  async forgetBook(accountId: string, bookId: string): Promise<void> {
    const account = await this.accounts.byId(accountId);
    if (!account) return;
    for (const task of await this.store.ofAccount(accountId)) {
      if (task.bookId !== bookId || task.state.kind === 'done') continue;
      await this.cancel(account, task.id);
      if (task.charged) await this.accounts.charge(account, 'bookTranslations', 1).giveBack();
    }
  }

  async create(account: Account, bookId: string, startAt: string | null): Promise<BookTranslationTask> {
    if (PLANS[account.plan].monthlyBookTranslations === 0) throw new ForbiddenException({ code: 'PLAN_REQUIRED' });
    const book = await this.books.status(account.id, bookId);
    if (book.language?.toLowerCase().startsWith('vi')) throw new BadRequestException({ code: 'ALREADY_VIETNAMESE' });

    const earlier = (await this.store.ofAccount(account.id)).find(
      (task) => task.bookId === bookId && task.state.kind !== 'done',
    );
    if (earlier) return earlier.state.kind === 'stopped' ? this.resume(account, earlier.id) : earlier;

    const chapters: ChapterInLine[] = (await this.books.mainChapters(account.id, bookId)).map(({ id, label, wordCount }) => ({
      chapterId: id,
      label,
      words: wordCount,
    }));
    const remaining = chapterLine({ chapters, startAt, skip: await this.translations.translatedOf(bookId) });
    if (remaining.length === 0) throw new ConflictException({ code: 'ALREADY_TRANSLATED' });

    await this.accounts.charge(account, 'bookTranslations', 1).take();
    const task: BookTranslationTask = {
      id: randomUUID(),
      accountId: account.id,
      bookId,
      bookTitle: book.title,
      remaining,
      translated: [],
      current: null,
      state: { kind: 'queued' },
      charged: true,
      createdAt: new Date(),
      finishedAt: null,
    };
    await this.store.save(task);
    this.enqueue(task, task.createdAt);
    return task;
  }

  async list(account: Account, now = new Date()): Promise<BookTranslationTask[]> {
    const tasks = await this.store.ofAccount(account.id);
    return tasks.filter(({ finishedAt }) => !finishedAt || now.getTime() - finishedAt.getTime() < FINISHED_KEPT_MS);
  }

  /** Place in the account's line of long tasks, from 1; null unless queued. */
  position(task: BookTranslationTask): number | null {
    return this.slots.position(task.id);
  }

  /** The book's translated chapters, and the newest task for it. */
  async ofBook(account: Account, bookId: string): Promise<{ translated: string[]; task: BookTranslationTask | null }> {
    await this.books.status(account.id, bookId);
    const tasks = (await this.list(account)).filter((task) => task.bookId === bookId);
    return { translated: await this.translations.translatedOf(bookId), task: tasks.at(-1) ?? null };
  }

  async chapter(account: Account, chapterId: string): Promise<Block[]> {
    await this.books.chapter(account.id, chapterId);
    const blocks = await this.translations.find(chapterId);
    if (!blocks) throw new NotFoundException({ code: 'TRANSLATION_NOT_READY' });
    return blocks;
  }

  /** Stops the task and forgets it; chapters already translated stay, and the month's use is not handed back. */
  async cancel(account: Account, id: string): Promise<void> {
    await this.owned(account, id);
    const run = this.runs.get(id);
    if (run) run.cancelled = true;
    this.slots.withdraw(id);
    await this.edits.serially(id, () => this.store.remove(id));
  }

  /** Goes on from where a stopped task left off, at no further charge. */
  async resume(account: Account, id: string): Promise<BookTranslationTask> {
    const task = await this.owned(account, id);
    if (task.state.kind !== 'stopped') return task;
    const queued = await this.edits.edit(task, (current) => ({ ...current, state: { kind: 'queued' }, finishedAt: null }));
    if (!queued) throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
    this.enqueue(queued, new Date());
    return queued;
  }

  async putFirst(account: Account, id: string, chapterId: string): Promise<BookTranslationTask> {
    const task = await this.edits.edit(await this.owned(account, id), (current) => putFirst(current, chapterId));
    if (!task) throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
    return task;
  }

  private async owned(account: Account, id: string): Promise<BookTranslationTask> {
    const task = (await this.store.ofAccount(account.id)).find((candidate) => candidate.id === id);
    if (!task) throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
    return task;
  }

  private enqueue(task: BookTranslationTask, queuedAt: Date): void {
    this.slots.enqueue({ id: task.id, accountId: task.accountId, queuedAt, run: () => this.work(task) });
  }

  private async work(queued: BookTranslationTask): Promise<void> {
    const run: Run = { cancelled: false };
    this.runs.set(queued.id, run);
    try {
      // The head is under way from here: its chapter stays in place, and shows, while the style sheet is written.
      let task = await this.edits.edit(queued, (current) => ({
        ...current,
        state: { kind: 'running' },
        current: current.remaining.length > 0 ? { done: 0, parts: 1 } : null,
      }));
      const sheet = task && (await this.styleSheetOf(task));
      while (task && sheet && !run.cancelled && task.remaining.length > 0) {
        const [head] = task.remaining;
        await this.translateChapter(task, head, sheet, run);
        if (run.cancelled) return;
        task = await this.edits.edit(task, (current) => ({
          ...current,
          remaining: current.remaining.filter(({ chapterId }) => chapterId !== head.chapterId),
          translated: [...current.translated, head],
          current: null,
        }));
      }
      if (task && !run.cancelled) {
        await this.edits.edit(task, (current) => ({ ...current, state: { kind: 'done' }, finishedAt: new Date() }));
      }
    } catch {
      if (!run.cancelled) await this.stop(queued);
    } finally {
      this.runs.delete(queued.id);
    }
  }

  /** A failure on our side hands the month's use back, once. */
  private async stop(task: TaskRef): Promise<void> {
    try {
      const held = { charged: false };
      await this.edits.edit(task, (current) => {
        held.charged = current.charged;
        return { ...current, state: { kind: 'stopped', code: 'TRANSLATE_FAILED' }, current: null, charged: false, finishedAt: new Date() };
      });
      const account = await this.accounts.byId(task.accountId);
      if (held.charged && account) await this.accounts.charge(account, 'bookTranslations', 1).giveBack();
    } catch {
      this.logger.warn(`Book translation task ${task.id} could not be stopped cleanly`);
    }
  }

  private async styleSheetOf(task: BookTranslationTask): Promise<StyleSheet> {
    const known = await this.sheets.find(task.bookId);
    if (known) return known;
    const chapters = await this.books.mainChapters(task.accountId, task.bookId);
    const sheet = await this.answer({
      promptVersion: TRANSLATION_PROMPT_VERSION,
      instructions: styleSheetInstructions(),
      input: {
        title: task.bookTitle,
        author: (await this.books.status(task.accountId, task.bookId)).author,
        passages: passagesFrom(chapters.flatMap(({ blocks }) => blocks), SHEET_WORDS),
      },
      outputSchema: StyleSheetSchema,
      maxInputTokens: MAX_INPUT_TOKENS,
      maxOutputTokens: SHEET_OUTPUT_TOKENS,
    });
    await this.sheets.save(task.bookId, sheet);
    return sheet;
  }

  /** Drafts in order, each part reading on from the last, then edits every draft beside its English. */
  private async translateChapter(task: BookTranslationTask, head: ChapterInLine, sheet: StyleSheet, run: Run): Promise<void> {
    if (await this.translations.find(head.chapterId)) return;
    const chapter = await this.books.chapter(task.accountId, head.chapterId);
    const parts = partsOf(chapter.blocks, PART_WORDS);
    await this.edits.edit(task, (current) => ({ ...current, current: { done: 0, parts: Math.max(parts.length * 2, 1) } }));
    const partDone = () =>
      this.edits.edit(task, (current) => ({
        ...current,
        current: current.current && { ...current.current, done: current.current.done + 1 },
      }));

    const drafts: Block[][] = [];
    for (const [index, part] of parts.entries()) {
      if (run.cancelled) return;
      const carried = drafts.flat().slice(-BLOCKS_CARRIED).map(({ text }) => text);
      drafts.push(
        await this.blocksFor(part, {
          instructions: translationInstructions({ part: index + 1, partCount: parts.length, sheet }),
          input: {
            blocks: part.map(({ blockId, text }) => ({ id: blockId, text })),
            ...(carried.length > 0 ? { previous_translation: carried } : {}),
          },
        }),
      );
      await partDone();
    }

    const edited = await mapInBatches(parts, PARTS_AT_ONCE, async (part, index) => {
      if (run.cancelled) return part;
      const blocks = await this.blocksFor(part, {
        instructions: editingInstructions(sheet),
        input: {
          blocks: part.map(({ blockId, text }, at) => ({ id: blockId, text, draft: drafts[index][at].text })),
        },
      });
      await partDone();
      return blocks;
    });
    if (!run.cancelled) await this.translations.save({ chapterId: head.chapterId, bookId: task.bookId, blocks: edited.flat() });
  }

  /** The model's text for each block of [part], which must come back whole and in order. */
  private async blocksFor(part: Block[], { instructions, input }: { instructions: string; input: unknown }): Promise<Block[]> {
    const words = part.reduce((total, block) => total + countWords(block.text), 0);
    const value = await this.answer({
      promptVersion: TRANSLATION_PROMPT_VERSION,
      instructions,
      input,
      outputSchema: TranslationOutputSchema.refine(
        ({ blocks }) => blocks.length === part.length && blocks.every(({ id }, at) => id === part[at].blockId),
      ),
      maxInputTokens: MAX_INPUT_TOKENS,
      // Vietnamese runs longer than English, and reasoning models count their thinking here too.
      maxOutputTokens: words * 4 + 2_000,
    });
    return part.map((block, at) => ({ ...block, text: value.blocks[at].text }));
  }

  private async answer<T>(request: LlmCompletionRequest<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return (await this.llm.complete(request)).value;
      } catch (error) {
        if (attempt >= TRIES) throw error;
      }
    }
  }
}
