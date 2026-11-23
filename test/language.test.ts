import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMostlyInLanguage, languageDisplayName } from '../src/language';

test('languageDisplayName returns a readable name', () => {
  assert.equal(languageDisplayName('ru'), 'Русский');
  assert.equal(languageDisplayName('de'), 'Немецкий');
  assert.equal(languageDisplayName('xx'), 'XX');
});

test('isMostlyInLanguage detects Russian documentation', () => {
  const russian =
    'Возвращает последнее вхождение подстроки в строку или -1, если её нет. ' +
    'Параметр position задаёт позицию, с которой начинается поиск.';
  assert.equal(isMostlyInLanguage(russian, 'ru'), true);
  assert.equal(isMostlyInLanguage('Returns the last occurrence of a substring.', 'ru'), false);
});

test('isMostlyInLanguage ignores short strings and unknown languages', () => {
  assert.equal(isMostlyInLanguage('Привет', 'ru'), false);
  assert.equal(isMostlyInLanguage('Возвращает последнее вхождение подстроки в строку.', 'xx'), false);
});
