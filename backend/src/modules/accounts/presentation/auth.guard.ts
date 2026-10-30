import { CanActivate, createParamDecorator, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AccountService } from '../application/account.service';
import { Account } from '../domain/plan';

type AuthedRequest = Request & { account?: Account };

/** Lets a request through only with a valid access token, and remembers whose it is. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly accounts: AccountService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    const account = scheme === 'Bearer' && token ? await this.accounts.fromToken(token) : null;
    if (!account) throw new UnauthorizedException({ code: 'SIGN_IN_REQUIRED' });
    request.account = account;
    return true;
  }
}

export const CurrentAccount = createParamDecorator((_: unknown, context: ExecutionContext): Account => {
  const { account } = context.switchToHttp().getRequest<AuthedRequest>();
  if (!account) throw new UnauthorizedException({ code: 'SIGN_IN_REQUIRED' });
  return account;
});
