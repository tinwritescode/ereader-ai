import { z } from 'zod';
import { LlmCompletion, LlmCompletionRequest, LlmError, LlmGateway } from './llm-gateway';
import { LlmOptions } from './llm-config';

const REQUEST_TIMEOUT_MS = 180_000;
// Conservative for Vietnamese text: tokenizers spend roughly one token per two to three characters.
const CHARACTERS_PER_TOKEN = 2.5;

const ChatCompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

/** Speaks the OpenAI Chat Completions protocol, which most providers and gateways accept. */
export class OpenAiCompatibleLlmGateway implements LlmGateway {
  readonly model: string;

  constructor(private readonly options: LlmOptions) {
    this.model = options.model;
  }

  async complete<T>(request: LlmCompletionRequest<T>): Promise<LlmCompletion<T>> {
    const userContent = JSON.stringify(request.input);
    const estimatedTokens = Math.ceil((request.instructions.length + userContent.length) / CHARACTERS_PER_TOKEN);
    if (estimatedTokens > request.maxInputTokens) {
      throw new LlmError('INPUT_TOO_LARGE');
    }

    const response = await this.post({
      model: this.model,
      messages: [
        { role: 'system', content: request.instructions },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      max_tokens: request.maxOutputTokens,
    }, request.signal);

    const body = ChatCompletionSchema.safeParse(await response.json().catch(() => null));
    if (!body.success) throw new LlmError('UPSTREAM_ERROR');
    const value = request.outputSchema.safeParse(parseJson(body.data.choices[0].message.content ?? ''));
    if (!value.success) throw new LlmError('INVALID_OUTPUT');
    return {
      value: value.data,
      usage: {
        inputTokens: body.data.usage?.prompt_tokens ?? estimatedTokens,
        outputTokens: body.data.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async post(payload: unknown, signal: AbortSignal | undefined): Promise<Response> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    }).catch(() => {
      throw new LlmError('UPSTREAM_ERROR');
    });
    if (!response.ok) throw new LlmError('UPSTREAM_ERROR');
    return response;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
