import { createRemoteJWKSet, JWTVerifyGetKey, jwtVerify } from 'jose';
import { z } from 'zod';
import { IdentityError, IdentityGateway, SessionTokens, SignIn } from '../application/identity-gateway';

const API_BASE = 'https://api.workos.com';

export type WorkosOptions = { clientId: string; apiKey: string };

const WorkosEnvSchema = z.object({ WORKOS_CLIENT_ID: z.string().min(1), WORKOS_API_KEY: z.string().min(1) });

export function workosOptionsFromEnv(env: NodeJS.ProcessEnv): WorkosOptions {
  const { WORKOS_CLIENT_ID, WORKOS_API_KEY } = WorkosEnvSchema.parse(env);
  return { clientId: WORKOS_CLIENT_ID, apiKey: WORKOS_API_KEY };
}

const TokensSchema = z.object({ access_token: z.string(), refresh_token: z.string() });
const SignInSchema = TokensSchema.extend({
  user: z.object({ id: z.string(), email: z.string(), email_verified: z.boolean() }),
});

/** The app signs in with PKCE; tokens are traded here so the API key stays on the server. */
export class WorkosIdentityGateway implements IdentityGateway {
  constructor(
    private readonly options: WorkosOptions,
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(`${API_BASE}/sso/jwks/${options.clientId}`)),
  ) {}

  async exchange(code: string, codeVerifier: string): Promise<SignIn> {
    const body = SignInSchema.parse(
      await this.authenticate({ grant_type: 'authorization_code', code, code_verifier: codeVerifier }),
    );
    const { id, email, email_verified: emailVerified } = body.user;
    return { ...tokensOf(body), user: { id, email, emailVerified } };
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    return tokensOf(
      TokensSchema.parse(await this.authenticate({ grant_type: 'refresh_token', refresh_token: refreshToken })),
    );
  }

  async verify(accessToken: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(accessToken, this.keys, { algorithms: ['RS256'] });
      // Signing keys can be shared across an environment; the token must be for this app.
      return payload.client_id === this.options.clientId ? (payload.sub ?? null) : null;
    } catch {
      return null;
    }
  }

  private async authenticate(grant: Record<string, string>): Promise<unknown> {
    const response = await fetch(`${API_BASE}/user_management/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.options.clientId, client_secret: this.options.apiKey, ...grant }),
    });
    if (!response.ok) throw new IdentityError(`WorkOS answered ${response.status}`);
    return response.json();
  }
}

function tokensOf({ access_token, refresh_token }: z.infer<typeof TokensSchema>): SessionTokens {
  return { accessToken: access_token, refreshToken: refresh_token };
}
