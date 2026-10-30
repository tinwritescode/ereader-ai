import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { WorkosIdentityGateway } from './workos.identity-gateway';

const clientId = 'client_test';

describe('WorkosIdentityGateway.verify', () => {
  let sign: (claims: Record<string, unknown>, expires?: string) => Promise<string>;
  let gateway: WorkosIdentityGateway;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'key-1', alg: 'RS256' };
    gateway = new WorkosIdentityGateway({ clientId, apiKey: 'sk' }, createLocalJWKSet({ keys: [jwk] }));
    sign = (claims, expires = '5m') =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
        .setSubject('user_1')
        .setExpirationTime(expires)
        .sign(privateKey);
  });

  it('answers with the user of a good token', async () => {
    expect(await gateway.verify(await sign({ client_id: clientId }))).toBe('user_1');
  });

  it('refuses a token for another app', async () => {
    expect(await gateway.verify(await sign({ client_id: 'client_other' }))).toBeNull();
  });

  it('refuses an expired token', async () => {
    expect(await gateway.verify(await sign({ client_id: clientId }, '-1m'))).toBeNull();
  });

  it('refuses a token signed with another key, or with none', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ client_id: clientId })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
      .setSubject('user_1')
      .setExpirationTime('5m')
      .sign(privateKey);
    expect(await gateway.verify(forged)).toBeNull();
    expect(await gateway.verify('not-a-token')).toBeNull();
  });
});
