import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectLanguage, isMostlyInLanguage, languageDisplayName } from '../src/language';
import { maskMarkdown } from '../src/markdown';

/**
 * One realistic hover description per language. The detector has to tell apart
 * close relatives that share an alphabet — ru/uk/be and en/de/fr/es/it/pt/pl/tr —
 * because a false positive silently hides a translation the user asked for.
 */
const SAMPLES: Readonly<Record<string, string>> = {
  ru: 'Возвращает последнее вхождение подстроки в строку или -1, если её нет.',
  uk: 'Повертає останнє входження підрядка в рядок або -1, якщо його немає.',
  be: 'Вяртае апошняе ўваходжанне падстрокі ў радок або -1, калі яго няма.',
  en: 'Returns the last occurrence of a substring in the string, or -1 if it is not present.',
  de: 'Gibt die Position des letzten Vorkommens der Teilzeichenkette zurück, oder -1, wenn sie nicht vorhanden ist.',
  fr: 'Renvoie la dernière occurrence d’une sous-chaîne dans la chaîne, ou -1 si elle n’est pas présente.',
  es: 'Devuelve la última aparición de una subcadena en la cadena, o -1 si no está presente.',
  it: 'Restituisce l’ultima occorrenza di una sottostringa nella stringa, oppure -1 se non è presente.',
  pt: 'Retorna a última ocorrência de uma subcadeia na string, ou -1 se não estiver presente.',
  pl: 'Zwraca ostatnie wystąpienie podłańcucha w ciągu lub -1, jeśli go nie ma.',
  tr: 'Alt dizenin son oluşumunu döndürür, yoksa -1 değerini verir.',
  ja: '文字列内で最後に現れる位置を返します。見つからない場合は -1 を返します。',
  zh: '返回子字符串在字符串中最后一次出现的位置，如果未找到则返回 -1。',
  ko: '문자열에서 마지막으로 나타나는 위치를 반환합니다.',
};

test('languageDisplayName returns a readable name', () => {
  assert.equal(languageDisplayName('ru'), 'Русский');
  assert.equal(languageDisplayName('de'), 'Немецкий');
  assert.equal(languageDisplayName('xx'), 'XX');
});

test('detectLanguage identifies every supported language', () => {
  for (const [code, text] of Object.entries(SAMPLES)) {
    assert.equal(detectLanguage(text)?.code, code, `wrong guess for ${code}: ${text}`);
  }
});

test('detectLanguage does not confuse close relatives', () => {
  assert.notEqual(detectLanguage(SAMPLES.ru)?.code, 'uk');
  assert.notEqual(detectLanguage(SAMPLES.uk)?.code, 'ru');
  assert.notEqual(detectLanguage(SAMPLES.uk)?.code, 'be');
  assert.notEqual(detectLanguage(SAMPLES.be)?.code, 'uk');
  assert.notEqual(detectLanguage(SAMPLES.en)?.code, 'de');
  assert.notEqual(detectLanguage(SAMPLES.de)?.code, 'en');
  assert.notEqual(detectLanguage(SAMPLES.zh)?.code, 'ja');
  assert.notEqual(detectLanguage(SAMPLES.ja)?.code, 'zh');
});

test('isMostlyInLanguage matches the target language only', () => {
  assert.equal(isMostlyInLanguage(SAMPLES.ru, 'ru'), true);
  assert.equal(isMostlyInLanguage(SAMPLES.uk, 'ru'), false);
  assert.equal(isMostlyInLanguage(SAMPLES.ru, 'uk'), false);
  assert.equal(isMostlyInLanguage(SAMPLES.uk, 'uk'), true);
  assert.equal(isMostlyInLanguage(SAMPLES.en, 'en'), true);
  assert.equal(isMostlyInLanguage(SAMPLES.de, 'en'), false);
  assert.equal(isMostlyInLanguage(SAMPLES.en, 'ru'), false);
  assert.equal(isMostlyInLanguage(SAMPLES.de, 'de'), true);
  assert.equal(isMostlyInLanguage(SAMPLES.ja, 'ja'), true);
  assert.equal(isMostlyInLanguage(SAMPLES.zh, 'zh'), true);
});

test('isMostlyInLanguage normalises the target code', () => {
  assert.equal(isMostlyInLanguage(SAMPLES.ru, 'RU'), true);
  assert.equal(isMostlyInLanguage(SAMPLES.ru, 'ru-RU'), true);
  assert.equal(isMostlyInLanguage(SAMPLES.ru, 'ru_RU'), true);
});

test('isMostlyInLanguage ignores short text and unknown languages', () => {
  assert.equal(isMostlyInLanguage('Привет', 'ru'), false);
  assert.equal(isMostlyInLanguage('Возвращает последнее вхождение подстроки в строку.', 'xx'), false);
});

test('Latin text without a single giveaway word stays undetected', () => {
  // Dutch, Swedish or a made-up language: we must not claim it is English.
  const unknown = 'Frobnicator quuxbar bazqux blorp snizzle wibble wobble florp';
  assert.equal(detectLanguage(unknown), undefined);
  assert.equal(isMostlyInLanguage(unknown, 'en'), false);
});

test('mixed documentation is translated instead of skipped', () => {
  const mostlyEnglish = `${SAMPLES.en} Если подстрока не найдена, возвращается -1.`;
  assert.equal(isMostlyInLanguage(mostlyEnglish, 'ru'), false);
  assert.equal(isMostlyInLanguage(mostlyEnglish, 'en'), true);
});

test('a short foreign reference does not hide Russian prose', () => {
  const mostlyRussian = `${SAMPLES.ru} См. String.prototype.lastIndexOf.`;
  assert.equal(isMostlyInLanguage(mostlyRussian, 'ru'), true);
});

test('inline code and links do not vote for a language', () => {
  const documentation =
    'Возвращает последнее вхождение `searchString` в строку или -1, если её нет. ' +
    'См. [MDN](https://developer.mozilla.org/docs/Web/JavaScript).';
  const { maskedText } = maskMarkdown(documentation);
  assert.equal(isMostlyInLanguage(maskedText, 'ru'), true);
});
