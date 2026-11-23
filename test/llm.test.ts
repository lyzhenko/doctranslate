import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import { test } from 'node:test';
import { chatCompletionsUrl, requestChatCompletion, TranslationError } from '../src/llm';

interface RecordedRequest {
  readonly url: string | undefined;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

interface TestServer {
  readonly baseUrl: string;
  readonly requests: RecordedRequest[];
  close(): Promise<void>;
}

async function startServer(
  handler: (body: string, response: ServerResponse) => void,
): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const server: Server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push({ url: request.url, headers: request.headers, body });
      handler(body, response);
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('test server has no port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

test('chatCompletionsUrl builds the endpoint once', () => {
  assert.equal(
    chatCompletionsUrl('https://api.deepseek.com/v1'),
    'https://api.deepseek.com/v1/chat/completions',
  );
  assert.equal(
    chatCompletionsUrl('https://api.deepseek.com/v1/'),
    'https://api.deepseek.com/v1/chat/completions',
  );
  assert.equal(
    chatCompletionsUrl('http://localhost:11434/v1/chat/completions'),
    'http://localhost:11434/v1/chat/completions',
  );
});

test('sends an OpenAI-compatible request and returns the answer', async () => {
  const server = await startServer((_body, response) => {
    json(response, 200, { choices: [{ message: { content: 'Привет ⟦B0⟧' } }] });
  });

  try {
    const answer = await requestChatCompletion(
      { baseUrl: server.baseUrl, model: 'test-model', timeoutMs: 5000, apiKey: 'secret-key' },
      [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
    );

    assert.equal(answer, 'Привет ⟦B0⟧');
    assert.equal(server.requests.length, 1);
    assert.equal(server.requests[0].url, '/v1/chat/completions');
    assert.equal(server.requests[0].headers.authorization, 'Bearer secret-key');

    const body = JSON.parse(server.requests[0].body) as {
      model: string;
      messages: unknown;
      stream: boolean;
    };
    assert.equal(body.model, 'test-model');
    assert.equal(body.stream, false);
    assert.deepEqual(body.messages, [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'hello' },
    ]);
  } finally {
    await server.close();
  }
});

test('supports array-shaped message content', async () => {
  const server = await startServer((_body, response) => {
    json(response, 200, {
      choices: [{ message: { content: [{ type: 'text', text: 'Раз' }, { type: 'text', text: 'два' }] } }],
    });
  });

  try {
    const answer = await requestChatCompletion(
      { baseUrl: server.baseUrl, model: 'm', timeoutMs: 5000, apiKey: 'k' },
      [{ role: 'user', content: 'x' }],
    );
    assert.equal(answer, 'Раздва');
  } finally {
    await server.close();
  }
});

test('maps 401 to an auth error without retrying', async () => {
  const server = await startServer((_body, response) => {
    response.writeHead(401, { 'Content-Type': 'application/json' });
    response.end('{"error":"invalid api key"}');
  });

  try {
    await assert.rejects(
      requestChatCompletion(
        { baseUrl: server.baseUrl, model: 'm', timeoutMs: 5000, apiKey: 'bad' },
        [{ role: 'user', content: 'x' }],
      ),
      (error: unknown) => error instanceof TranslationError && error.code === 'auth',
    );
    assert.equal(server.requests.length, 1);
  } finally {
    await server.close();
  }
});

test('retries once on a 503 answer', async () => {
  let calls = 0;
  const server = await startServer((_body, response) => {
    calls += 1;
    if (calls === 1) {
      response.writeHead(503, { 'Content-Type': 'text/plain' });
      response.end('busy');
      return;
    }
    json(response, 200, { choices: [{ message: { content: 'готово' } }] });
  });

  try {
    const answer = await requestChatCompletion(
      { baseUrl: server.baseUrl, model: 'm', timeoutMs: 5000, apiKey: 'k' },
      [{ role: 'user', content: 'x' }],
    );
    assert.equal(answer, 'готово');
    assert.equal(server.requests.length, 2);
  } finally {
    await server.close();
  }
});

test('times out slow answers', async () => {
  const server = await startServer((_body, response) => {
    setTimeout(() => {
      try {
        json(response, 200, { choices: [{ message: { content: 'слишком поздно' } }] });
      } catch {
        // The client has already aborted the socket.
      }
    }, 400);
  });

  try {
    await assert.rejects(
      requestChatCompletion(
        { baseUrl: server.baseUrl, model: 'm', timeoutMs: 80, apiKey: 'k' },
        [{ role: 'user', content: 'x' }],
      ),
      (error: unknown) => error instanceof TranslationError && error.code === 'timeout',
    );
  } finally {
    await server.close();
  }
});

test('reports an empty choices array as a response error', async () => {
  const server = await startServer((_body, response) => {
    json(response, 200, { choices: [] });
  });

  try {
    await assert.rejects(
      requestChatCompletion(
        { baseUrl: server.baseUrl, model: 'm', timeoutMs: 5000, apiKey: 'k' },
        [{ role: 'user', content: 'x' }],
      ),
      (error: unknown) => error instanceof TranslationError && error.code === 'response',
    );
  } finally {
    await server.close();
  }
});
