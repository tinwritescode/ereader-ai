import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AccountService } from '../../accounts/application/account.service';
import { Account, PLANS } from '../../accounts/domain/plan';
import { AccountSlots } from '../../../shared/tasks/account-slots';
import { ChapterVoiceRequest, ChapterVoiceState, ChapterVoiceTask, isFinished } from '../domain/chapter-voice';
import { spokenSeconds } from '../domain/cloud-voice';
import { CHAPTER_VOICE_STORE, ChapterVoiceStore } from './chapter-voice-store';
import { SpeechService } from './speech.service';
import { TTS_GATEWAY, TtsGateway } from './tts-gateway';

// The voice service batches sixteen streams; two tasks share them.
const SENTENCES_AT_ONCE = 8;
const FINISHED_KEPT_MS = 7 * 24 * 60 * 60 * 1_000;

type Run = { cancelled: boolean; done: number };

/** Works through chapter voice tasks in this process; the single backend instance owns them all. */
@Injectable()
export class ChapterVoiceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChapterVoiceService.name);
  private readonly runs = new Map<string, Run>();

  constructor(
    @Inject(CHAPTER_VOICE_STORE) private readonly store: ChapterVoiceStore,
    @Optional() @Inject(TTS_GATEWAY) private readonly tts: TtsGateway | null,
    private readonly speech: SpeechService,
    private readonly accounts: AccountService,
    private readonly slots: AccountSlots,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const task of await this.store.unfinished()) {
      const queued: ChapterVoiceTask = { ...task, state: { kind: 'queued' }, done: 0 };
      await this.store.save(queued);
      this.enqueue(queued, task.createdAt);
    }
  }

  async create(account: Account, request: ChapterVoiceRequest): Promise<ChapterVoiceTask> {
    if (!PLANS[account.plan].chapterVoice) throw new ForbiddenException({ code: 'PLAN_REQUIRED' });
    if (!this.tts) throw new ServiceUnavailableException({ code: 'SPEECH_UNAVAILABLE' });
    const voice = (await this.tts.voices()).find(({ code }) => code === request.voiceCode);
    if (!voice) throw new BadRequestException({ code: 'VOICE_UNKNOWN' });

    // The same chapter in other words, a shorter version or a translation, is other work.
    const sameJob = (task: ChapterVoiceTask) =>
      task.chapterId === request.chapterId &&
      task.voiceCode === request.voiceCode &&
      task.sentences.length === request.sentences.length &&
      task.sentences.every((sentence, index) => sentence === request.sentences[index]);
    const underWay = (await this.store.ofAccount(account.id)).find((task) => sameJob(task) && !isFinished(task));
    if (underWay) return underWay;

    const task: ChapterVoiceTask = {
      ...request,
      id: randomUUID(),
      accountId: account.id,
      voiceName: voice.name,
      state: { kind: 'queued' },
      done: 0,
      createdAt: new Date(),
      finishedAt: null,
    };
    await this.store.save(task);
    this.enqueue(task, task.createdAt);
    return task;
  }

  async list(account: Account, now = new Date()): Promise<ChapterVoiceTask[]> {
    const tasks = await this.store.ofAccount(account.id);
    return tasks.filter(({ finishedAt }) => !finishedAt || now.getTime() - finishedAt.getTime() < FINISHED_KEPT_MS);
  }

  /** Place in the account's line of long tasks, from 1; null unless queued. */
  position(task: ChapterVoiceTask): number | null {
    return this.slots.position(task.id);
  }

  async cancel(account: Account, id: string): Promise<void> {
    await this.owned(account, id);
    const run = this.runs.get(id);
    if (run) run.cancelled = true;
    this.slots.withdraw(id);
    await this.store.remove(id);
  }

  async resume(account: Account, id: string): Promise<ChapterVoiceTask> {
    const task = await this.owned(account, id);
    if (task.state.kind !== 'stopped') return task;
    const queued: ChapterVoiceTask = { ...task, state: { kind: 'queued' }, done: 0, finishedAt: null };
    await this.store.save(queued);
    this.enqueue(queued, new Date());
    return queued;
  }

  private async owned(account: Account, id: string): Promise<ChapterVoiceTask> {
    const task = (await this.store.ofAccount(account.id)).find((candidate) => candidate.id === id);
    if (!task) throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
    return task;
  }

  private enqueue(task: ChapterVoiceTask, queuedAt: Date): void {
    this.slots.enqueue({ id: task.id, accountId: task.accountId, queuedAt, run: () => this.finish(task) });
  }

  private async finish(queued: ChapterVoiceTask): Promise<void> {
    const run: Run = { cancelled: false, done: 0 };
    this.runs.set(queued.id, run);
    const task: ChapterVoiceTask = { ...queued, state: { kind: 'running' } };
    try {
      await this.store.save(task);
      const state = await this.read(task, run);
      if (!run.cancelled) await this.store.save({ ...task, done: run.done, state, finishedAt: new Date() });
    } catch {
      this.logger.warn(`Chapter voice task ${task.id} could not be saved`);
    } finally {
      this.runs.delete(task.id);
    }
  }

  private async read(task: ChapterVoiceTask, run: Run): Promise<ChapterVoiceState> {
    const account = await this.accounts.byId(task.accountId);
    const tts = this.tts;
    if (!account || !tts) return { kind: 'stopped', code: 'SPEECH_FAILED' };

    try {
      await this.speech.speakAll({
        tts,
        sentences: task.sentences,
        voiceCode: task.voiceCode,
        charge: (text) => this.accounts.charge(account, 'vbeeSeconds', spokenSeconds(text)),
        atOnce: SENTENCES_AT_ONCE,
        stopped: () => run.cancelled,
        onSpoken: async () => {
          run.done += 1;
          await this.store.setDone(task.id, run.done);
        },
      });
      return { kind: 'done' };
    } catch (error) {
      return stoppedBy(error);
    }
  }
}

/** Why reading aloud stopped, for a task to show. */
export function stoppedBy(error: unknown): Extract<ChapterVoiceState, { kind: 'stopped' }> {
  const overLimit = error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS;
  return { kind: 'stopped', code: overLimit ? 'VBEE_LIMIT' : 'SPEECH_FAILED' };
}
