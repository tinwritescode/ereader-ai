import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccountService } from '../application/account.service';
import { Account, PLAN_NAMES } from '../domain/plan';
import { AuthGuard, CurrentAccount } from './auth.guard';

const SignInSchema = z.object({ code: z.string().min(1), codeVerifier: z.string().min(1) });
const RefreshSchema = z.object({ refreshToken: z.string().min(1) });
const PlanSchema = z.object({ plan: z.enum(PLAN_NAMES) });

function parsed<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException({ code: 'REQUEST_INVALID' });
  return result.data;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly accounts: AccountService) {}

  @Post('token')
  @HttpCode(200)
  async token(@Body() body: unknown) {
    const { code, codeVerifier } = parsed(SignInSchema, body);
    const { accessToken, refreshToken } = await this.accounts.signIn(code, codeVerifier);
    return { accessToken, refreshToken };
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    return this.accounts.refresh(parsed(RefreshSchema, body).refreshToken);
  }
}

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly accounts: AccountService) {}

  @Get()
  me(@CurrentAccount() account: Account) {
    return this.accounts.summary(account);
  }

  @Post('plan-request')
  @HttpCode(204)
  requestPlan(@CurrentAccount() account: Account, @Body() body: unknown) {
    return this.accounts.requestPlan(account, parsed(PlanSchema, body).plan);
  }
}

@Controller('admin/accounts')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly accounts: AccountService) {}

  @Get()
  async list(@CurrentAccount() account: Account) {
    return { accounts: await this.accounts.listAccounts(account) };
  }

  @Patch(':id')
  setPlan(@CurrentAccount() account: Account, @Param('id') id: string, @Body() body: unknown) {
    return this.accounts.setPlan(account, id, parsed(PlanSchema, body).plan);
  }
}
