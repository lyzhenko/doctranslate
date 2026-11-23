import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TranslationSettings } from '../src/config';
import { TranslationError, type ChatRequest } from '../src/llm';
import type { ChatMessage } from '../src/prompt';
import { DocumentationTranslator } from '../src/translator';
import { DEFAULT_TEST_SETTINGS, HOVER_DOCUMENTATION } from './fixtures';

const TRANSLATED_SENTENCE =
  'Возвращает последнее вхождение подстроки в строку или -1, если её нет.';

function createTranslator(
  request: ChatRequest,
  overrides: Partial<TranslationSettings> = {},
  apiKey: string | null = 'test-key',
): DocumentationTranslator {
  return new DocumentationTranslator({
    settings: () => ({ ...DEFAULT_TEST_SETTINGS, ...overrides }),
    apiKey: async () => (apiKey === null ? undefined : apiKey),
    log: () => undefined,
    request,
  });
}

function answerWithTranslation(messages: readonly ChatMessage[]): string {
  return messages[1].content.replace(
    'Returns the last occurrence of a substring in the string, or -1 if it is not present.',
    TRANSLATED_SENTENCE,
  );
}

test('translates prose, keeps code and caches the result', async () => {
  const calls: ChatMessage[][] = [];
  const translator = createTranslator(async (_connection, messages) => {
    calls.push(messages.map((message) => ({ ...message })));
    return answerWithTranslation(messages);
  });

  const translated = await translator.translate(HOVER_DOCUMENTATION);

  assert.match(translated, /Возвращает последнее вхождение подстроки/);
  assert.match(translated, /\(method\) String\.lastIndexOf\(searchString: string, position\?: number\): number/);
  assert.match(translated, /https:\/\/developer\.mozilla\.org/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].role, 'system');
  assert.match(calls[0][0].content, /Target language: .*"ru"/);
  assert.ok(!calls[0][1].content.includes('lastIndexOf(searchString'));

  const cached = await translator.translate(HOVER_DOCUMENTATION);
  assert.equal(cached, translated);
  assert.equal(calls.length, 1);
  assert.equal(translator.cacheSize, 1);

  translator.clearCache();
  await translator.translate(HOVER_DOCUMENTATION);
  assert.equal(calls.length, 2);
});

test('retries once when the model loses placeholders', async () => {
  let calls = 0;
  const translator = createTranslator(async (_connection, messages) => {
    calls += 1;
    if (calls === 1) {
      return 'Перевод без маркеров';
    }
    assert.equal(messages.length, 4);
    assert.equal(messages[2].role, 'assistant');
    return answerWithTranslation(messages);
  });

  const translated = await translator.translate(HOVER_DOCUMENTATION);
  assert.equal(calls, 2);
  assert.match(translated, /lastIndexOf/);
});

test('rejects a translation that still loses placeholders after the retry', async () => {
  let calls = 0;
  const translator = createTranslator(async () => {
    calls += 1;
    return 'Снова без маркеров';
  });

  await assert.rejects(
    translator.translate(HOVER_DOCUMENTATION),
    (error: unknown) => error instanceof TranslationError && error.code === 'format',
  );
  assert.equal(calls, 2);
});

test('reports a missing API key without calling the API', async () => {
  let calls = 0;
  const translator = createTranslator(async () => {
    calls += 1;
    return '';
  }, {}, null);

  await assert.rejects(
    translator.translate(HOVER_DOCUMENTATION),
    (error: unknown) => error instanceof TranslationError && error.code === 'no-key',
  );
  assert.equal(calls, 0);
});

test('allows keyless local endpoints when apiKeyRequired is false', async () => {
  let calls = 0;
  const translator = createTranslator(
    async (_connection, messages) => {
      calls += 1;
      return messages[1].content;
    },
    { apiKeyRequired: false },
    null,
  );

  const translated = await translator.translate(HOVER_DOCUMENTATION);
  assert.equal(calls, 1);
  assert.equal(translated, HOVER_DOCUMENTATION);
});

test('skips documentation longer than maxDocChars', async () => {
  const translator = createTranslator(async () => HOVER_DOCUMENTATION, { maxDocChars: 100 });

  await assert.rejects(
    translator.translate(HOVER_DOCUMENTATION),
    (error: unknown) => error instanceof TranslationError && error.code === 'too-long',
  );
});

test('deduplicates concurrent translations of the same text', async () => {
  let calls = 0;
  let resolveRequest: (() => void) | undefined;

  const translator = createTranslator(
    (_connection, messages) =>
      new Promise<string>((resolve) => {
        calls += 1;
        resolveRequest = () => resolve(messages[1].content);
      }),
  );

  const first = translator.translate(HOVER_DOCUMENTATION);
  const second = translator.translate(HOVER_DOCUMENTATION);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls, 1);
  assert.ok(resolveRequest);
  resolveRequest();

  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  assert.match(a, /lastIndexOf/)
});
