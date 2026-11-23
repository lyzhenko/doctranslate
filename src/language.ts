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

const TARGET_SCRIPTS: Readonly<Record<string, RegExp>> = {
  ar: /[\u0600-\u06FF]/u,
  be: /[\u0400-\u04FF]/u,
  de: /[A-Za-zÄÖÜäöüß]/u,
  en: /[A-Za-z]/u,
  es: /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/u,
  fr: /[A-Za-zÀÂÇÉÈÊËÎÏÔÙÛÜŸàâçéèêëîïôùûüÿœ]/u,
  it: /[A-Za-zÀÈÉÌÒÙàèéìòù]/u,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/u,
  ko: /[\uAC00-\uD7AF]/u,
  pl: /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/u,
  pt: /[A-Za-zÁÂÃÀÇÉÊÍÓÔÕÚÜáâãàçéêíóôõúü]/u,
  ru: /[\u0400-\u04FF]/u,
  tr: /[A-Za-zÇĞİÖŞÜçğıöşü]/u,
  uk: /[\u0400-\u04FF]/u,
  zh: /[\u4E00-\u9FFF]/u,
};

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
 * Heuristic used to avoid paying for a translation when the documentation is
 * already written in the target language. Only applies to languages whose
 * script we can recognise reliably; anything else is treated as "translate".
 */
export function isMostlyInLanguage(text: string, code: string): boolean {
  const script = TARGET_SCRIPTS[code];
  if (!script) {
    return false;
  }
  const letters = text.replace(/⟦[A-Z]+\d+⟧/g, ' ').match(/\p{L}/gu) ?? [];
  if (letters.length < 20) {
    return false;
  }
  const matching = letters.filter((letter) => script.test(letter)).length;
  return matching / letters.length >= 0.4;
}
