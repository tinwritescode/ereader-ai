import { InMemoryAccountStore } from '../application/account-store';
import { IdentityError, IdentityGateway, SignIn } from '../application/identity-gateway';
import { AccountsModule } from '../accounts.module';

export const SUPER_ADMIN = 'owner@example.com';

/** Takes a user id as the access token, and creates that account on sight. */
export class FakeIdentity implements IdentityGateway {
  /** Sign-in codes that work, and who they belong to. */
  readonly codes = new Map<string, SignIn['user']>();

  constructor(private readonly store: InMemoryAccountStore) {}

  async exchange(code: string): Promise<SignIn> {
    const user = this.codes.get(code);
    if (!user) throw new IdentityError('bad code');
    return { user, accessToken: user.id, refreshToken: `refresh-${user.id}` };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken.startsWith('refresh-')) throw new IdentityError('over');
    return { accessToken: refreshToken.slice('refresh-'.length), refreshToken };
  }

  async verify(accessToken: string): Promise<string | null> {
    if (accessToken === 'expired') return null;
    if (!(await this.store.find(accessToken))) {
      await this.store.upsert({ id: accessToken, email: `${accessToken}@example.com` });
    }
    return accessToken;
  }
}

export function testAccounts() {
  const store = new InMemoryAccountStore();
  const identity = new FakeIdentity(store);
  return { store, identity, module: AccountsModule.register({ store, identity, superAdminEmail: SUPER_ADMIN }) };
}
