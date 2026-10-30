import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryAccountStore } from './application/account-store';
import { usageMonth } from './domain/plan';
import { FakeIdentity, SUPER_ADMIN, testAccounts } from './testing/fake-identity';

describe('accounts', () => {
  let app: INestApplication;
  let store: InMemoryAccountStore;
  let identity: FakeIdentity;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const signIn = (id: string, email: string, emailVerified = true) => {
    identity.codes.set(`code-${id}`, { id, email, emailVerified });
    return http().post('/auth/token').send({ code: `code-${id}`, codeVerifier: 'verifier' });
  };

  beforeEach(async () => {
    const fakes = testAccounts();
    store = fakes.store;
    identity = fakes.identity;
    const moduleRef = await Test.createTestingModule({ imports: [fakes.module] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('signs in with the code and shows the free plan with nothing used', async () => {
    const { body } = await signIn('user-1', 'reader@example.com').expect(200);
    expect(body).toEqual({ accessToken: 'user-1', refreshToken: 'refresh-user-1' });

    const me = await http().get('/me').set(as(body.accessToken)).expect(200);
    expect(me.body).toMatchObject({
      email: 'reader@example.com',
      role: 'user',
      plan: 'free',
      requestedPlan: null,
      usage: { digests: 0, vbeeMinutes: 0 },
      plans: { free: { books: 3, monthlyDigests: 10, monthlyVbeeMinutes: 30 } },
    });
    expect(me.body.resetsOn).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('refuses a bad sign-in code and a finished session', async () => {
    await http().post('/auth/token').send({ code: 'nope', codeVerifier: 'v' }).expect(401).expect(({ body }) => {
      expect(body.code).toBe('SIGN_IN_FAILED');
    });
    await http().post('/auth/token').send({ code: 'nope' }).expect(400);
    await http().post('/auth/refresh').send({ refreshToken: 'over' }).expect(401);
  });

  it('renews a session', async () => {
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: 'refresh-user-1' })
      .expect(200)
      .expect({ accessToken: 'user-1', refreshToken: 'refresh-user-1' });
  });

  it('turns away /me without a token', async () => {
    await http().get('/me').expect(401);
    await http().get('/me').set(as('expired')).expect(401);
  });

  it('makes the verified owner email the super admin on the max plan, whatever its case', async () => {
    const { body } = await signIn('owner', SUPER_ADMIN.toUpperCase()).expect(200);
    await http().get('/me').set(as(body.accessToken)).expect(200).expect(({ body: me }) => {
      expect(me).toMatchObject({ role: 'super_admin', plan: 'max' });
    });
  });

  it('never makes the owner email super admin before it is verified', async () => {
    const { body } = await signIn('squatter', SUPER_ADMIN, false).expect(200);
    await http().get('/me').set(as(body.accessToken)).expect(({ body: me }) => {
      expect(me).toMatchObject({ role: 'user', plan: 'free' });
    });
  });

  it('keeps one super admin, even when a second account verifies the owner email', async () => {
    await signIn('owner', SUPER_ADMIN).expect(200);
    await signIn('second', SUPER_ADMIN).expect(200);
    expect((await store.find('second'))?.role).toBe('user');
    expect((await store.find('owner'))?.role).toBe('super_admin');
  });

  it('keeps the plan the super admin chose when signing in again', async () => {
    await signIn('owner', SUPER_ADMIN);
    await signIn('user-1', 'reader@example.com');
    await http().patch('/admin/accounts/user-1').set(as('owner')).send({ plan: 'plus' }).expect(200);
    await signIn('user-1', 'reader@example.com');
    expect((await store.find('user-1'))?.plan).toBe('plus');
  });

  it('lets an account ask for a plan, and the super admin grant it', async () => {
    await signIn('owner', SUPER_ADMIN);
    await signIn('user-1', 'reader@example.com');
    await http().post('/me/plan-request').set(as('user-1')).send({ plan: 'plus' }).expect(204);
    await store.spend({ accountId: 'user-1', month: usageMonth(new Date()), meter: 'digests', amount: 2, limit: 10 });

    const { body } = await http().get('/admin/accounts').set(as('owner')).expect(200);
    expect(body.accounts).toContainEqual({
      id: 'user-1',
      email: 'reader@example.com',
      role: 'user',
      plan: 'free',
      requestedPlan: 'plus',
      usage: { digests: 2, vbeeSeconds: 0 },
    });

    await http().patch('/admin/accounts/user-1').set(as('owner')).send({ plan: 'plus' }).expect(200);
    await http().get('/me').set(as('user-1')).expect(({ body: me }) => {
      expect(me).toMatchObject({ plan: 'plus', requestedPlan: null });
    });
  });

  it('keeps the admin routes from everyone else', async () => {
    await signIn('user-1', 'reader@example.com');
    await http().get('/admin/accounts').set(as('user-1')).expect(403);
    await http().patch('/admin/accounts/user-1').set(as('user-1')).send({ plan: 'max' }).expect(403);
    expect((await store.find('user-1'))?.plan).toBe('free');
  });

  it('refuses an unknown plan and an unknown account', async () => {
    await signIn('owner', SUPER_ADMIN);
    await http().post('/me/plan-request').set(as('owner')).send({ plan: 'gold' }).expect(400);
    await http().patch('/admin/accounts/ghost').set(as('owner')).send({ plan: 'max' }).expect(404);
  });
});
