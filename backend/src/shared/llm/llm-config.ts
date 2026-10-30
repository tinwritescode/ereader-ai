import { z } from 'zod';

const LlmEnvSchema = z.object({
  LLM_BASE_URL: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
});

export type LlmOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export function llmOptionsFromEnv(env: Record<string, string | undefined>): LlmOptions {
  const parsed = LlmEnvSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`LLM configuration invalid: ${missing}. Set them in backend/.env.`);
  }
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = parsed.data;
  return { baseUrl: LLM_BASE_URL.replace(/\/+$/, ''), apiKey: LLM_API_KEY, model: LLM_MODEL };
}
