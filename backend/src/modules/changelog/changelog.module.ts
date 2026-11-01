import { Controller, DynamicModule, Get, Inject, Module } from '@nestjs/common';
import { Release, newestFirst } from './domain/release';

const RELEASES = Symbol('RELEASES');

/** Public: what changed in each version is no secret, and the app asks before sign-in. */
@Controller('changelog')
class ChangelogController {
  constructor(@Inject(RELEASES) private readonly releases: Release[]) {}

  @Get()
  list(): { releases: Release[] } {
    return { releases: this.releases };
  }
}

@Module({})
export class ChangelogModule {
  static register({ releases }: { releases: readonly Release[] }): DynamicModule {
    return {
      module: ChangelogModule,
      controllers: [ChangelogController],
      providers: [{ provide: RELEASES, useValue: newestFirst(releases) }],
    };
  }
}
