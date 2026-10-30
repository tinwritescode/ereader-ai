import { z } from 'zod';

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LlmCompletionRequest<T> = {
  promptVersion: string;
  instructions: string;
  input: unknown;
  outputSchema: z.ZodType<T, z.ZodTypeDef, unknown>;
  maxInputTokens: number;
  maxOutputTokens: number;
  signal?: AbortSignal;
};

export type LlmCompletion<T> = {
  value: T;
  usage: LlmUsage;
};

export type LlmErrorKind = 'INPUT_TOO_LARGE' | 'UPSTREAM_ERROR' | 'INVALID_OUTPUT';

/** Carries only a kind: provider messages may echo prompts or book content, which must not reach logs. */
export class LlmError extends Error {
  constructor(readonly kind: LlmErrorKind) {
    super(kind);
    this.name = 'LlmError';
  }
}

export const LLM_GATEWAY = Symbol('LLM_GATEWAY');

/** Application code depends on this seam, never on a provider SDK. */
export interface LlmGateway {
  /** Part of every cache key, so a model change never serves stale output. */
  readonly model: string;
  complete<T>(request: LlmCompletionRequest<T>): Promise<LlmCompletion<T>>;
}
