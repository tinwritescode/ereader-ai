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
import { ChapterVoiceRequest, ChapterVoiceState, ChapterVoiceTask, isFinished } from '../domain/chapter-voice';
import { spokenSeconds } from '../domain/cloud-voice';
import { CHAPTER_VOICE_STORE, ChapterVoiceStore } from './chapter-voice-store';
import { SpeechService } from './speech.service';
import { TTS_GATEWAY, TtsGateway } from './tts-gateway';

// Keeps one account from filling the GPU, and the bill with it.
const RUNNING_PER_ACCOUNT = 2;
// The voice service batches sixteen streams; two tasks share them.
const SENTENCES_AT_ONCE = 8;
const FINISHED_KEPT_MS = 7 * 24 * 60 * 60 * 1_000;

type Run = { cancelled: boolean; done: number };

/** Works through chapter voice tasks in this process; the single backend instance owns them all. */
@Injectable()
export class ChapterVoiceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChapterVoiceService.name);
  private readonly runs = new Map<string, Run>();
  // One start at a time, so two requests cannot both take the last free slot.
  private starting: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(CHAPTER_VOICE_STORE) private readonly store: ChapterVoiceStore,
    @Optional() @Inject(TTS_GATEWAY) private readonly tts: TtsGateway | null,
    private readonly speech: SpeechService,
    private readonly accounts: AccountService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const interrupted = await this.store.unfinished();
    await Promise.all(interrupted.map((task) => this.store.save({ ...task, state: { kind: 'queued' }, done: 0 })));
    await Promise.all([...new Set(interrupted.map((task) => task.accountId))].map((id) => this.startNext(id)));
  }

  async create(account: Account, request: ChapterVoiceRequest): Promise<ChapterVoiceTask> {
    if (!PLANS[account.plan].chapterVoice) throw new ForbiddenException({ code: 'PLAN_REQUIRED' });
    if (!this.tts) throw new ServiceUnavailableException({ code: 'SPEECH_UNAVAILABLE' });
    const voice = (await this.tts.voices()).find(({ code }) => code === request.voiceCode);
    if (!voice) throw new BadRequestException({ code: 'VOICE_UNKNOWN' });

    const sameJob = (task: ChapterVoiceTask) =>
      task.chapterId === request.chapterId && task.voiceCode === request.voiceCode && task.minutes === request.minutes;
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
    await this.startNext(account.id);
    return task;
  }

  async list(account: Account, now = new Date()): Promise<ChapterVoiceTask[]> {
    const tasks = await this.store.ofAccount(account.id);
    return tasks.filter(({ finishedAt }) => !finishedAt || now.getTime() - finishedAt.getTime() < FINISHED_KEPT_MS);
  }

  async cancel(account: Account, id: string): Promise<void> {
    await this.owned(account, id);
    const run = this.runs.get(id);
    if (run) run.cancelled = true;
    await this.store.remove(id);
    await this.startNext(account.id);
  }

  async resume(account: Account, id: string): Promise<ChapterVoiceTask> {
    const task = await this.owned(account, id);
    if (task.state.kind !== 'stopped') return task;
    const queued: ChapterVoiceTask = { ...task, state: { kind: 'queued' }, done: 0, finishedAt: null };
    await this.store.save(queued);
    await this.startNext(account.id);
    return queued;
  }

  private async owned(account: Account, id: string): Promise<ChapterVoiceTask> {
    const task = (await this.store.ofAccount(account.id)).find((candidate) => candidate.id === id);
    if (!task) throw new NotFoundException({ code: 'TASK_NOT_FOUND' });
    return task;
  }

  private startNext(accountId: string): Promise<void> {
    const started = this.starting.then(() => this.fillSlots(accountId));
    this.starting = started.catch(() => undefined);
    return started;
  }

  private async fillSlots(accountId: string): Promise<void> {
    const tasks = await this.store.ofAccount(accountId);
    const free = RUNNING_PER_ACCOUNT - tasks.filter(({ id }) => this.runs.has(id)).length;
    const next = tasks.filter(({ state }) => state.kind === 'queued').slice(0, Math.max(free, 0));
    for (const task of next) {
      const run: Run = { cancelled: false, done: 0 };
      this.runs.set(task.id, run);
      const running: ChapterVoiceTask = { ...task, state: { kind: 'running' } };
      await this.store.save(running);
      void this.finish(running, run);
    }
  }

  private async finish(task: ChapterVoiceTask, run: Run): Promise<void> {
    try {
      const state = await this.read(task, run);
      if (!run.cancelled) await this.store.save({ ...task, done: run.done, state, finishedAt: new Date() });
    } catch {
      this.logger.warn(`Chapter voice task ${task.id} could not be saved`);
    } finally {
      this.runs.delete(task.id);
      await this.startNext(task.accountId).catch(() => this.logger.warn('Next chapter voice task could not start'));
    }
  }

  private async read(task: ChapterVoiceTask, run: Run): Promise<ChapterVoiceState> {
    const account = await this.accounts.byId(task.accountId);
    const tts = this.tts;
    if (!account || !tts) return { kind: 'stopped', code: 'SPEECH_FAILED' };

    let next = 0;
    let failure: ChapterVoiceState | null = null;
    const worker = async () => {
      while (!run.cancelled && failure === null && next < task.sentences.length) {
        const text = task.sentences[next];
        next += 1;
        try {
          await this.speech.speak(tts, text, task.voiceCode, this.accounts.charge(account, 'vbeeSeconds', spokenSeconds(text)));
          run.done += 1;
          await this.store.setDone(task.id, run.done);
        } catch (error) {
          failure = stoppedBy(error);
        }
      }
    };
    await Promise.all(Array.from({ length: SENTENCES_AT_ONCE }, worker));
    return failure ?? { kind: 'done' };
  }
}

function stoppedBy(error: unknown): ChapterVoiceState {
  const overLimit = error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS;
  return { kind: 'stopped', code: overLimit ? 'VBEE_LIMIT' : 'SPEECH_FAILED' };
}
