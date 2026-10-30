import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { z } from 'zod';
import { llmOptionsFromEnv } from './llm-config';
import { LlmError } from './llm-gateway';
import { OpenAiCompatibleLlmGateway } from './openai-compatible.llm-gateway';

const AnswerSchema = z.object({ paragraphs: z.array(z.string()) });

type Recorded = { url: string; authorization: string | undefined; body: unknown };

describe('OpenAiCompatibleLlmGateway', () => {
  let server: Server;
  let baseUrl: string;
  let recorded: Recorded[];
  let reply: (response: ServerResponse) => void;

  beforeEach(async () => {
    recorded = [];
    server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      recorded.push({ url: request.url ?? '', authorization: request.headers.authorization, body: JSON.parse(raw) });
      reply(response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('server has no port');
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const json = (status: number, body: unknown) => (response: ServerResponse) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };

  const completion = (content: string) =>
    json(200, {
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    });

  const gateway = () => new OpenAiCompatibleLlmGateway({ baseUrl, apiKey: 'test-key', model: 'test-model' });

  const ask = (maxInputTokens = 1_000) =>
    gateway().complete({
      promptVersion: 'digest-v2',
      instructions: 'Shorten the text.',
      input: { text: 'một hai ba' },
      outputSchema: AnswerSchema,
      maxInputTokens,
      maxOutputTokens: 500,
    });

  it('sends a JSON chat completion and returns the validated value with usage', async () => {
    reply = completion('{"paragraphs":["một","hai"]}');

    await expect(ask()).resolves.toEqual({
      value: { paragraphs: ['một', 'hai'] },
      usage: { inputTokens: 120, outputTokens: 30 },
    });

    expect(recorded).toEqual([
      {
        url: '/v1/chat/completions',
        authorization: 'Bearer test-key',
        body: {
          model: 'test-model',
          messages: [
            { role: 'system', content: 'Shorten the text.' },
            { role: 'user', content: '{"text":"một hai ba"}' },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 500,
        },
      },
    ]);
  });

  it('rejects output that does not match the schema', async () => {
    reply = completion('{"paragraphs":"not a list"}');

    await expect(ask()).rejects.toEqual(new LlmError('INVALID_OUTPUT'));
  });

  it('rejects output that is not JSON', async () => {
    reply = completion('Here is your summary');

    await expect(ask()).rejects.toEqual(new LlmError('INVALID_OUTPUT'));
  });

  it('reports an upstream error status', async () => {
    reply = json(500, { error: { message: 'boom' } });

    await expect(ask()).rejects.toEqual(new LlmError('UPSTREAM_ERROR'));
  });

  it('refuses input over the token budget without calling the provider', async () => {
    reply = completion('{"paragraphs":[]}');

    await expect(ask(2)).rejects.toEqual(new LlmError('INPUT_TOO_LARGE'));
    expect(recorded).toHaveLength(0);
  });
});

describe('OpenAiCompatibleLlmGateway against the configured provider', () => {
  const live = process.env.LLM_LIVE === '1' ? it : it.skip;
  live('completes against the configured provider (LLM_LIVE=1)', async () => {
    const result = await new OpenAiCompatibleLlmGateway(llmOptionsFromEnv(process.env)).complete({
      promptVersion: 'live-check',
      instructions: 'Return JSON {"paragraphs": ["xin chào"]} exactly.',
      input: {},
      outputSchema: AnswerSchema,
      maxInputTokens: 1_000,
      maxOutputTokens: 200,
    });
    expect(result.value.paragraphs.length).toBeGreaterThan(0);
  }, 120_000);
});
