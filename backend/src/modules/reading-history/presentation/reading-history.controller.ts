import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Put, Query, UseGuards } from '@nestjs/common';
import { Account } from '../../accounts/domain/plan';
import { AuthGuard, CurrentAccount } from '../../accounts/presentation/auth.guard';
import { ReadingHistoryService } from '../application/reading-history.service';
import {
  HistoryFilterSchema,
  ReadingSession,
  RecordingRequestSchema,
  SessionIdSchema,
  SessionReportSchema,
} from '../domain/reading-session';

const toSessionResponse = ({ id, accountId: _owner, ...session }: ReadingSession) => ({ sessionId: id, ...session });

@Controller('history')
@UseGuards(AuthGuard)
export class ReadingHistoryController {
  constructor(private readonly history: ReadingHistoryService) {}

  @Get()
  async list(@CurrentAccount() account: Account, @Query() query: unknown) {
    const filter = HistoryFilterSchema.safeParse(query);
    if (!filter.success) throw new BadRequestException({ code: 'HISTORY_FILTER_INVALID' });
    const { recording, sessions } = await this.history.list(account, filter.data);
    return { recording, sessions: sessions.map(toSessionResponse) };
  }

  /** Sent again as reading goes on; the same id moves one session, never adds another. */
  @Put('sessions/:id')
  @HttpCode(204)
  record(@Param('id') id: string, @CurrentAccount() account: Account, @Body() body: unknown) {
    const report = SessionReportSchema.safeParse(body);
    if (!SessionIdSchema.safeParse(id).success || !report.success) throw new BadRequestException({ code: 'HISTORY_REPORT_INVALID' });
    return this.history.record({ account, id, report: report.data });
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentAccount() account: Account) {
    return this.history.remove(account, id);
  }

  @Delete()
  @HttpCode(204)
  clear(@CurrentAccount() account: Account) {
    return this.history.clear(account);
  }

  @Put('recording')
  @HttpCode(204)
  setRecording(@CurrentAccount() account: Account, @Body() body: unknown) {
    const parsed = RecordingRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'HISTORY_RECORDING_INVALID' });
    return this.history.setRecording(account, parsed.data.on);
  }
}
