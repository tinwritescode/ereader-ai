export const IDENTITY_GATEWAY = Symbol('IDENTITY_GATEWAY');

export type SessionTokens = { accessToken: string; refreshToken: string };

export type SignIn = SessionTokens & {
  user: { id: string; email: string; emailVerified: boolean };
};

export class IdentityError extends Error {}

/** Application code depends on this seam, never on the identity provider. */
export interface IdentityGateway {
  /** Throws [IdentityError] when the provider refuses the code. */
  exchange(code: string, codeVerifier: string): Promise<SignIn>;
  /** Throws [IdentityError] when the session is over. */
  refresh(refreshToken: string): Promise<SessionTokens>;
  /** The user id of a valid access token; null otherwise. */
  verify(accessToken: string): Promise<string | null>;
}
