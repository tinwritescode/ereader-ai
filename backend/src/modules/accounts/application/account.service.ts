import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UsageCharge } from '../../../shared/usage-charge';
import { Account, Meter, nextReset, PlanName, PLANS, usageMonth } from '../domain/plan';
import { ACCOUNT_STORE, AccountStore } from './account-store';
import { IDENTITY_GATEWAY, IdentityError, IdentityGateway, SessionTokens } from './identity-gateway';

export const SUPER_ADMIN_EMAIL = Symbol('SUPER_ADMIN_EMAIL');

const METER_LIMITS = {
  digests: { code: 'DIGEST_LIMIT', limit: (account: Account) => PLANS[account.plan].monthlyDigests },
  vbeeSeconds: { code: 'VBEE_LIMIT', limit: (account: Account) => PLANS[account.plan].monthlyVbeeMinutes * 60 },
} satisfies Record<Meter, { code: string; limit: (account: Account) => number }>;

@Injectable()
export class AccountService {
  constructor(
    @Inject(ACCOUNT_STORE) private readonly store: AccountStore,
    @Inject(IDENTITY_GATEWAY) private readonly identity: IdentityGateway,
    @Inject(SUPER_ADMIN_EMAIL) private readonly superAdminEmail: string,
  ) {}

  async signIn(code: string, codeVerifier: string): Promise<SessionTokens & { account: Account }> {
    const { user, ...tokens } = await this.identified(() => this.identity.exchange(code, codeVerifier));
    const account = await this.store.upsert({ id: user.id, email: user.email });
    // Only a verified address may claim the role: anyone can type this email at sign-up.
    const owner = user.emailVerified && user.email.toLowerCase() === this.superAdminEmail.toLowerCase();
    if (owner && account.role !== 'super_admin' && (await this.store.promote(account.id))) {
      return { ...tokens, account: { ...account, role: 'super_admin', plan: 'max' } };
    }
    return { ...tokens, account };
  }

  refresh(refreshToken: string): Promise<SessionTokens> {
    return this.identified(() => this.identity.refresh(refreshToken));
  }

  /** The account behind an access token; null when the token is not good. */
  async fromToken(accessToken: string): Promise<Account | null> {
    const id = await this.identity.verify(accessToken);
    return id === null ? null : this.store.find(id);
  }

  async summary(account: Account) {
    const now = new Date();
    const { digests, vbeeSeconds } = await this.store.usage(account.id, usageMonth(now));
    return {
      email: account.email,
      role: account.role,
      plan: account.plan,
      requestedPlan: account.requestedPlan,
      usage: { digests, vbeeMinutes: Math.ceil(vbeeSeconds / 60) },
      resetsOn: nextReset(now),
      plans: PLANS,
    };
  }

  requestPlan(account: Account, plan: PlanName): Promise<void> {
    return this.store.requestPlan(account.id, plan);
  }

  async listAccounts(admin: Account) {
    this.requireSuperAdmin(admin);
    return this.store.list(usageMonth(new Date()));
  }

  async setPlan(admin: Account, id: string, plan: PlanName): Promise<Account> {
    this.requireSuperAdmin(admin);
    const account = await this.store.setPlan(id, plan);
    if (!account) throw new NotFoundException({ code: 'ACCOUNT_NOT_FOUND' });
    return account;
  }

  /** Counts [amount] against the account's plan for this month. */
  charge(account: Account, meter: Meter, amount: number): UsageCharge {
    const { code, limit } = METER_LIMITS[meter];
    const spend = { accountId: account.id, month: usageMonth(new Date()), meter, amount };
    return {
      take: async () => {
        if (!(await this.store.spend({ ...spend, limit: limit(account) }))) {
          throw new HttpException({ code }, HttpStatus.TOO_MANY_REQUESTS);
        }
      },
      giveBack: () => this.store.refund(spend),
    };
  }

  private requireSuperAdmin(account: Account): void {
    if (account.role !== 'super_admin') throw new ForbiddenException({ code: 'SUPER_ADMIN_REQUIRED' });
  }

  private async identified<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof IdentityError) throw new UnauthorizedException({ code: 'SIGN_IN_FAILED' });
      throw error;
    }
  }
}
