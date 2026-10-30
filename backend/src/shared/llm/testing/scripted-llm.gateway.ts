import { LlmCompletion, LlmCompletionRequest, LlmGateway } from '../llm-gateway';

/** Test double: answers each call with `answer(request)`, validated by the request's own schema, and records the calls. */
export class ScriptedLlmGateway implements LlmGateway {
  readonly model = 'scripted-model';
  readonly requests: Array<LlmCompletionRequest<unknown>> = [];

  constructor(public answer: (request: LlmCompletionRequest<unknown>) => unknown | Promise<unknown>) {}

  async complete<T>(request: LlmCompletionRequest<T>): Promise<LlmCompletion<T>> {
    this.requests.push(request);
    const raw = await this.answer(request);
    return { value: request.outputSchema.parse(raw), usage: { inputTokens: 1, outputTokens: 1 } };
  }
}
