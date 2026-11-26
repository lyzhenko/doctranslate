const FALLBACK_NAMES: Readonly<Record<string, string>> = {
  ar: 'العربية',
  be: 'Беларуская',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  kk: 'Қазақша',
  ko: '한국어',
  pl: 'Polski',
  pt: 'Português',
  ru: 'Русский',
  tr: 'Türkçe',
  uk: 'Українська',
  zh: '中文',
};

/**
 * Scripts the detector can tell apart. Cyrillic and Latin are scored word by
 * word; the rest are recognised by the script alone because we only need to
 * know that the text is *not* the target language.
 */
type ScriptId = 'arabic' | 'cyrillic' | 'hangul' | 'han' | 'kana' | 'latin';

interface LanguageProfile {
  /** ISO 639-1 code, the same one `docTranslate.targetLanguage` uses. */
  readonly code: string;
  readonly script: ScriptId;
  /**
   * Letters that are characteristic for this language and rare in its closest
   * relatives: `ы`, `э`, `ё`, `ъ` for Russian, `і`, `ї`, `є`, `ґ` for
   * Ukrainian, `ў` for Belarusian, umlauts for German and so on.
   */
  readonly marks: string;
  /** Function words and typical doc-comment verbs that give away the language. */
  readonly words: readonly string[];
}

/** A detected language and how strong the evidence for it was. */
export interface LanguageGuess {
  readonly code: string;
  /** 0 means "no positive evidence", only the script-level default. */
  readonly score: number;
}

/**
 * Languages the detector knows by name. Latin and Cyrillic languages share an
 * alphabet, so a target language is only accepted when it wins by a margin;
 * see {@link detectLanguage}.
 */
const PROFILES: readonly LanguageProfile[] = [
  {
    code: 'ru',
    script: 'cyrillic',
    marks: 'ыэёъ',
    words: [
      'и',
      'не',
      'что',
      'это',
      'для',
      'как',
      'или',
      'если',
      'по',
      'из',
      'от',
      'до',
      'при',
      'же',
      'бы',
      'ли',
      'только',
      'также',
      'его',
      'её',
      'их',
      'этот',
      'эта',
      'эти',
      'который',
      'которая',
      'которые',
      'всех',
      'уже',
      'ещё',
      'был',
      'была',
      'быть',
      'может',
      'нужно',
      'значение',
      'возвращает',
      'возвращают',
      'содержит',
      'получает',
      'устанавливает',
      'задаёт',
      'задает',
    ],
  },
  {
    code: 'uk',
    script: 'cyrillic',
    marks: 'іїєґ',
    words: [
      'і',
      'та',
      'що',
      'це',
      'або',
      'якщо',
      'його',
      'її',
      'цей',
      'ця',
      'ці',
      'але',
      'між',
      'під',
      'над',
      'через',
      'після',
      'без',
      'про',
      'за',
      'крім',
      'щоб',
      'тому',
      'коли',
      'як',
      'ще',
      'вже',
      'був',
      'була',
      'бути',
      'може',
      'треба',
      'значення',
      'повертає',
      'повертають',
      'вказує',
      'містить',
      'задає',
    ],
  },
  {
    code: 'be',
    script: 'cyrillic',
    marks: 'ў',
    words: [
      'гэта',
      'гэты',
      'гэтага',
      'які',
      'якая',
      'якія',
      'ня',
      'ці',
      'праз',
      'паміж',
      'вяртае',
      'вяртаюць',
      'значэнне',
      'радок',
      'калі',
      'яго',
      'няма',
      'таксама',
      'толькі',
      'ужо',
      'можа',
      'задае',
      'змяшчае',
    ],
  },
  {
    code: 'en',
    script: 'latin',
    marks: '',
    words: [
      'the',
      'and',
      'of',
      'to',
      'is',
      'are',
      'that',
      'this',
      'for',
      'with',
      'from',
      'or',
      'if',
      'not',
      'it',
      'by',
      'as',
      'at',
      'on',
      'in',
      'an',
      'was',
      'were',
      'will',
      'can',
      'when',
      'which',
      'has',
      'have',
      'returns',
      'return',
      'gets',
      'sets',
      'creates',
    ],
  },
  {
    code: 'de',
    script: 'latin',
    // `ö` and `ü` are shared with Turkish, Hungarian and the Nordic languages,
    // so German is recognised by `ä`, `ß` and, mostly, by its function words.
    marks: 'äß',
    words: [
      'der',
      'die',
      'das',
      'und',
      'ist',
      'nicht',
      'ein',
      'eine',
      'einen',
      'einem',
      'eines',
      'mit',
      'für',
      'auf',
      'von',
      'zu',
      'den',
      'dem',
      'des',
      'wird',
      'werden',
      'sind',
      'oder',
      'wenn',
      'sie',
      'auch',
      'als',
      'bei',
      'nach',
      'aus',
      'nur',
      'gibt',
      'zurück',
    ],
  },
  {
    code: 'fr',
    script: 'latin',
    marks: 'àâçéèêëîïôûùœ',
    words: [
      'le',
      'la',
      'les',
      'des',
      'du',
      'un',
      'une',
      'et',
      'est',
      'en',
      'dans',
      'pour',
      'par',
      'sur',
      'avec',
      'pas',
      'qui',
      'que',
      'ou',
      'au',
      'aux',
      'ce',
      'cette',
      'ces',
      'sont',
      'être',
      'il',
      'elle',
      'on',
      'nous',
      'vous',
      'ils',
      'elles',
      'ne',
      'plus',
      'mais',
    ],
  },
  {
    code: 'es',
    script: 'latin',
    marks: 'ñ¿¡',
    words: [
      'el',
      'la',
      'los',
      'las',
      'un',
      'una',
      'de',
      'del',
      'y',
      'es',
      'son',
      'en',
      'por',
      'para',
      'con',
      'sin',
      'que',
      'como',
      'se',
      'su',
      'sus',
      'al',
      'no',
      'si',
      'cuando',
      'donde',
      'este',
      'esta',
      'pero',
      'o',
      'más',
      'también',
      'devuelve',
    ],
  },
  {
    code: 'it',
    script: 'latin',
    marks: 'ìò',
    words: [
      'il',
      'lo',
      'la',
      'gli',
      'le',
      'di',
      'del',
      'della',
      'delle',
      'che',
      'non',
      'per',
      'con',
      'una',
      'uno',
      'è',
      'e',
      'sono',
      'questo',
      'questa',
      'come',
      'più',
      'anche',
      'se',
      'ma',
      'su',
      'da',
      'dal',
      'dalla',
      'nel',
      'nella',
      'restituisce',
    ],
  },
  {
    code: 'pt',
    script: 'latin',
    marks: 'ãõ',
    words: [
      'o',
      'a',
      'os',
      'as',
      'um',
      'uma',
      'de',
      'do',
      'da',
      'dos',
      'das',
      'em',
      'no',
      'na',
      'nos',
      'nas',
      'por',
      'para',
      'com',
      'sem',
      'que',
      'como',
      'não',
      'é',
      'são',
      'se',
      'seu',
      'sua',
      'ao',
      'mais',
      'também',
      'ou',
      'quando',
      'onde',
      'retorna',
    ],
  },
  {
    code: 'pl',
    script: 'latin',
    marks: 'ąćęłńśźż',
    words: [
      'i',
      'w',
      'na',
      'z',
      'do',
      'nie',
      'jest',
      'są',
      'się',
      'dla',
      'oraz',
      'lub',
      'ale',
      'że',
      'jak',
      'który',
      'która',
      'które',
      'tego',
      'tym',
      'przez',
      'od',
      'po',
      'przy',
      'może',
      'można',
      'zwraca',
      'wartość',
      'jeśli',
      'gdy',
    ],
  },
  {
    code: 'tr',
    script: 'latin',
    marks: 'ışğ',
    words: [
      'bir',
      've',
      'bu',
      'da',
      'de',
      'için',
      'ile',
      'olarak',
      'gibi',
      'veya',
      'ama',
      'çok',
      'daha',
      'sonra',
      'göre',
      'kadar',
      'değil',
      'olan',
      'var',
      'yok',
      'eğer',
      'şu',
      'döndürür',
      'değerini',
    ],
  },
];

/** Minimum amount of letters before any guess is made; shorter text is noise. */
const MIN_LETTERS = 20;

/**
 * Share of letters that must belong to one script before a guess is made.
 * Below it the text is considered mixed and gets translated.
 */
const DOMINANCE_SHARE = 0.55;

/** Placeholders inserted by `maskMarkdown`; they must not affect detection. */
const PLACEHOLDER_PATTERN = /⟦[A-Z]+\d+⟧/g;

/** A characteristic letter is worth this many function words. */
const MARK_WEIGHT = 2;

/** Cap for repeated characteristic letters so one long word cannot dominate. */
const MAX_MARKS = 6;

const SCRIPT_PATTERNS: Readonly<Record<ScriptId, RegExp>> = {
  arabic: /\p{Script=Arabic}/gu,
  cyrillic: /\p{Script=Cyrillic}/gu,
  hangul: /\p{Script=Hangul}/gu,
  han: /\p{Script=Han}/gu,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  latin: /\p{Script=Latin}/gu,
};

const WORD_INDEX: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  PROFILES.map((profile) => [profile.code, new Set(profile.words)]),
);

/**
 * Human readable language name for hover headers, prompts and messages.
 * Uses Intl when available and falls back to a small built-in table.
 */
export function languageDisplayName(code: string, locale = 'ru'): string {
  const normalized = code.trim().toLowerCase();
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: 'language' });
    const name = displayNames.of(normalized);
    if (name && name !== normalized) {
      return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
    }
  } catch {
    // Intl.DisplayNames is optional on some Node versions.
  }
  return FALLBACK_NAMES[normalized] ?? normalized.toUpperCase();
}

/**
 * Detects the language of hover documentation.
 *
 * The question this answers is narrow: *is the text already written in the
 * language we translate into?* Answering it wrongly in either direction is
 * expensive, so the detector is deliberately conservative:
 *
 * - text shorter than {@link MIN_LETTERS} letters is never attributed;
 * - one script has to cover at least {@link DOMINANCE_SHARE} of the letters,
 *   which keeps a Russian JSDoc with an English type signature recognisable
 *   and sends genuinely mixed text to the translator;
 * - inside Cyrillic and Latin the language is chosen by characteristic
 *   letters (`і`, `ї`, `є`, `ґ`, `ў`, `ä`, `ü`, `ñ`, `ą`…) and function
 *   words, so Ukrainian is not mistaken for Russian and German for English;
 * - a language is only returned when it beats the runner-up by a margin,
 *   otherwise `undefined` is returned and the text is translated.
 *
 * Returns `undefined` when no confident guess is possible.
 */
export function detectLanguage(text: string): LanguageGuess | undefined {
  const clean = text.replace(PLACEHOLDER_PATTERN, ' ');
  const counts = countScripts(clean);
  const letters =
    counts.arabic +
    counts.cyrillic +
    counts.hangul +
    counts.han +
    counts.kana +
    counts.latin;
  if (letters < MIN_LETTERS) {
    return undefined;
  }

  // Japanese mixes kanji with kana, so kana decides before Han does.
  const kanaHan = counts.han + counts.kana;
  if (counts.kana > 0 && kanaHan / letters >= DOMINANCE_SHARE) {
    return { code: 'ja', score: kanaHan };
  }
  if (counts.han / letters >= DOMINANCE_SHARE) {
    return { code: 'zh', score: counts.han };
  }
  if (counts.hangul / letters >= DOMINANCE_SHARE) {
    return { code: 'ko', score: counts.hangul };
  }
  if (counts.arabic / letters >= DOMINANCE_SHARE) {
    return { code: 'ar', score: counts.arabic };
  }

  const script: 'cyrillic' | 'latin' =
    counts.cyrillic >= counts.latin ? 'cyrillic' : 'latin';
  if (counts[script] / letters < DOMINANCE_SHARE) {
    return undefined;
  }
  return scoreScript(clean, script);
}

/**
 * Heuristic used to avoid paying for a translation when the documentation is
 * already written in the target language.
 */
export function isMostlyInLanguage(text: string, code: string): boolean {
  const target = normalizeCode(code);
  const guess = detectLanguage(text);
  return guess !== undefined && guess.code === target;
}

/** Normalises `ru-RU` / `RU` to the `ru` used in the settings. */
function normalizeCode(code: string): string {
  return code.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

function countScripts(text: string): Record<ScriptId, number> {
  return {
    arabic: (text.match(SCRIPT_PATTERNS.arabic) ?? []).length,
    cyrillic: (text.match(SCRIPT_PATTERNS.cyrillic) ?? []).length,
    hangul: (text.match(SCRIPT_PATTERNS.hangul) ?? []).length,
    han: (text.match(SCRIPT_PATTERNS.han) ?? []).length,
    kana: (text.match(SCRIPT_PATTERNS.kana) ?? []).length,
    latin: (text.match(SCRIPT_PATTERNS.latin) ?? []).length,
  };
}

function scoreScript(
  text: string,
  script: 'cyrillic' | 'latin',
): LanguageGuess | undefined {
  const lower = text.toLowerCase();
  const words = lower.split(/[^\p{L}]+/u).filter(Boolean);
  const letterCounts = new Map<string, number>();
  for (const letter of lower.match(/\p{L}/gu) ?? []) {
    letterCounts.set(letter, (letterCounts.get(letter) ?? 0) + 1);
  }

  const ranked = PROFILES.filter((profile) => profile.script === script)
    .map((profile) => ({ code: profile.code, score: scoreProfile(profile, words, letterCounts) }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best) {
    return undefined;
  }
  if (best.score === 0) {
    // Cyrillic documentation without a single giveaway word is Russian in
    // practice; on the Latin side the same silence may be Dutch or Swedish,
    // so those stay untranslated-unknown and are sent to the translator.
    return script === 'cyrillic' ? { code: 'ru', score: 0 } : undefined;
  }
  if (runnerUp && runnerUp.score > 0 && best.score < runnerUp.score * 1.5) {
    return undefined;
  }
  return best;
}

function scoreProfile(
  profile: LanguageProfile,
  words: readonly string[],
  letterCounts: ReadonlyMap<string, number>,
): number {
  const dictionary = WORD_INDEX.get(profile.code);
  let score = 0;
  if (dictionary) {
    for (const word of words) {
      if (dictionary.has(word)) {
        score += 1;
      }
    }
  }
  let marks = 0;
  for (const letter of profile.marks) {
    marks += letterCounts.get(letter) ?? 0;
  }
  return score + MARK_WEIGHT * Math.min(marks, MAX_MARKS);
}
