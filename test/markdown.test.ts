import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOVER_DOCUMENTATION } from './fixtures';
import {
  countLetters,
  findMissingTokens,
  maskMarkdown,
  normalizeModelOutput,
  restoreMarkdown,
  splitMarkdown,
} from '../src/markdown';

test('splitMarkdown keeps every line and separates fenced code', () => {
  const segments = splitMarkdown(HOVER_DOCUMENTATION);
  assert.equal(segments.map((segment) => segment.text).join('\n'), HOVER_DOCUMENTATION);
  const code = segments.filter((segment) => segment.kind === 'code');
  assert.equal(code.length, 1);
  assert.match(code[0].text, /^```typescript\n[\s\S]*\n```$/);
});

test('maskMarkdown restores the original markdown losslessly', () => {
  const { maskedText, tokens } = maskMarkdown(HOVER_DOCUMENTATION);
  assert.equal(restoreMarkdown(maskedText, tokens), HOVER_DOCUMENTATION);
});

test('code, inline code and URLs are not part of the translatable prose', () => {
  const { maskedText } = maskMarkdown(HOVER_DOCUMENTATION);
  assert.ok(!maskedText.includes('lastIndexOf(searchString'));
  assert.ok(!maskedText.includes('developer.mozilla.org'));
  assert.ok(!maskedText.includes('`'));
  assert.ok(maskedText.includes('Returns the last occurrence'));
  assert.ok(maskedText.includes('@param searchString'));
  assert.ok(maskedText.includes('⟦B0⟧'));
});

test('restoreMarkdown removes placeholders the model invented', () => {
  const { tokens } = maskMarkdown('Hello `code` world');
  assert.equal(restoreMarkdown('Привет `code` мир ⟦C9⟧', tokens), 'Привет `code` мир ');
});

test('findMissingTokens reports dropped placeholders', () => {
  const { maskedText } = maskMarkdown(HOVER_DOCUMENTATION);
  assert.deepEqual(findMissingTokens(maskedText, 'Полностью испорченный ответ'), [...maskedText.match(/⟦[A-Z]+\d+⟧/g)!]);
  assert.deepEqual(findMissingTokens(maskedText, maskedText), []);
});

test('countLetters counts prose but not placeholders or markdown syntax', () => {
  assert.equal(countLetters('⟦B0⟧ ⟦C1⟧'), 0);
  assert.ok(countLetters('Hello `world`') >= 9);
});

test('normalizeModelOutput strips a surrounding code fence and trailing spaces', () => {
  assert.equal(normalizeModelOutput('```markdown\nПривет\n```'), 'Привет');
  assert.equal(normalizeModelOutput('  Привет\n'), 'Привет');
  assert.equal(normalizeModelOutput('Код ```inline``` остаётся'), 'Код ```inline``` остаётся');
});

test('unterminated fences are treated as code', () => {
  const segments = splitMarkdown('Текст\n```ts\nconst a = 1;');
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ['text', 'code'],
  );
  assert.match(segments[1].text, /const a = 1;/);
});

test('html tags survive masking', () => {
  const original = 'Use <b>bold</b> text and <a href="https://example.com">a link</a>.';
  const { maskedText, tokens } = maskMarkdown(original);
  assert.ok(!maskedText.includes('<b>'));
  assert.equal(restoreMarkdown(maskedText, tokens), original);
});
