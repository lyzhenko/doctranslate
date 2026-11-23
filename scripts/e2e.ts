import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import type { TranslationSettings } from '../src/config';
import { DocumentationTranslator } from '../src/translator';
import { HOVER_DOCUMENTATION } from '../test/fixtures';

/**
 * Offline end-to-end check: a fake OpenAI-compatible server receives the
 * masked documentation, "translates" one sentence and sends it back. The test
 * verifies that code never leaves the machine and that the restored hover is
 * correct. Run with `npm run e2e`.
 */

const ORIGINAL_SENTENCE =
  'Returns the last occurrence of a substring in the string, or -1 if it is not present.';
const TRANSLATED_SENTENCE =
  'Возвращает последнее вхождение подстроки в строку или -1, если её нет.';

function sendJson(response: ServerResponse, payload: unknown): void {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

async function main(): Promise<void> {
  const requestBodies: string[] = [];
  let authorization = '';
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      requestBodies.push(body);
      authorization = String(request.headers.authorization ?? '');
      const payload = JSON.parse(body) as { messages: Array<{ content: string }> };
      const masked = payload.messages[1].content;
      sendJson(response, {
        choices: [{ message: { content: masked.replace(ORIGINAL_SENTENCE, TRANSLATED_SENTENCE) } }],
      });
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('no port');
  }

  const settings: TranslationSettings = {
    enabled: true,
    targetLanguage: 'ru',
    apiBaseUrl: `http://127.0.0.1:${address.port}/v1`,
    model: 'fake-translator',
    apiKeyRequired: true,
    timeoutMs: 5000,
    maxDocChars: 10000,
  };

  try {
    const translator = new DocumentationTranslator({
      settings: () => settings,
      apiKey: async () => 'e2e-key',
      log: (message) => console.log(`  ${message}`),
    });

    const first = await translator.translate(HOVER_DOCUMENTATION);
    const second = await translator.translate(HOVER_DOCUMENTATION);

    assert.equal(requestBodies.length, 1, 'second translation must come from the cache');
    assert.equal(authorization, 'Bearer e2e-key');

    const sentToApi = (JSON.parse(requestBodies[0]) as { messages: Array<{ content: string }> })
      .messages[1].content;
    assert.ok(!sentToApi.includes('lastIndexOf(searchString'), 'code must never be sent to the API');
    assert.ok(!sentToApi.includes('developer.mozilla.org'), 'URLs must never be sent to the API');
    assert.ok(sentToApi.includes('Returns the last occurrence'));

    assert.equal(second, first);
    assert.ok(first.includes(TRANSLATED_SENTENCE), 'translated prose is present');
    assert.ok(
      first.includes('(method) String.lastIndexOf(searchString: string, position?: number): number'),
      'the signature is restored verbatim',
    );
    assert.ok(
      first.includes('https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/')
        && first.includes('Global_Objects/String/lastIndexOf'),
      'the URL is restored verbatim',
    );

    console.log('PASS: e2e translation pipeline (mask → API → restore → cache)');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error: unknown) => {
  console.error('FAIL:', error);
  process.exitCode = 1;
});
