import { DynamicModule, Module } from '@nestjs/common';
import { ACCOUNT_STORE, AccountStore } from './application/account-store';
import { AccountService, SUPER_ADMIN_EMAIL } from './application/account.service';
import { IDENTITY_GATEWAY, IdentityGateway } from './application/identity-gateway';
import { AdminController, AuthController, MeController } from './presentation/accounts.controller';
import { AuthGuard } from './presentation/auth.guard';

export type AccountsModuleOptions = {
  store: AccountStore;
  identity: IdentityGateway;
  superAdminEmail: string;
};

@Module({})
export class AccountsModule {
  static register({ store, identity, superAdminEmail }: AccountsModuleOptions): DynamicModule {
    return {
      module: AccountsModule,
      // Global: every feature module guards its routes with the same account.
      global: true,
      controllers: [AuthController, MeController, AdminController],
      providers: [
        AccountService,
        AuthGuard,
        { provide: ACCOUNT_STORE, useValue: store },
        { provide: IDENTITY_GATEWAY, useValue: identity },
        { provide: SUPER_ADMIN_EMAIL, useValue: superAdminEmail },
      ],
      exports: [AccountService, AuthGuard],
    };
  }
}
