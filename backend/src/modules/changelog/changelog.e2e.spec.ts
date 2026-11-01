import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ChangelogModule } from './changelog.module';
import { Release } from './domain/release';

const release = (version: string): Release => ({
  version,
  date: '2026-11-01',
  title: `Bản ${version}`,
  added: [[{ text: 'Mới', marked: true }]],
  fixed: [],
});

describe('changelog', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ChangelogModule.register({ releases: [release('1.2.0'), release('1.10.0')] })],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('lists every release, newest first, to anyone', async () => {
    const { body } = await request(app.getHttpServer()).get('/changelog').expect(200);
    expect(body).toEqual({ releases: [release('1.10.0'), release('1.2.0')] });
  });
});
