import type { TranslationSettings } from '../src/config';

/** The hover VS Code shows for `String.lastIndexOf` from the screenshot. */
export const HOVER_DOCUMENTATION = [
  '```typescript',
  '(method) String.lastIndexOf(searchString: string, position?: number): number',
  '```',
  '',
  '---',
  '',
  'Returns the last occurrence of a substring in the string, or -1 if it is not present.',
  '',
  '@param searchString — The substring to search for.',
  '',
  '@param position — The index at which to begin searching. If omitted, the search begins at the end of the string.',
  '',
  'See [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/lastIndexOf).',
].join('\n');

export const DEFAULT_TEST_SETTINGS: TranslationSettings = {
  enabled: true,
  targetLanguage: 'ru',
  apiBaseUrl: 'http://127.0.0.1:9/v1',
  model: 'test-model',
  apiKeyRequired: true,
  timeoutMs: 2000,
  maxDocChars: 10000,
};
