import * as vscode from 'vscode';

export const CONFIG_SECTION = 'docTranslate';
export const DEFAULT_API_BASE_URL = 'https://api.deepseek.com/v1';
export const DEFAULT_MODEL = 'deepseek-chat';

/** Настройки расширения, прочитанные из раздела `docTranslate` в `settings.json`. */
export interface TranslationSettings {
  /** Включён ли перевод документации в hover (`docTranslate.enabled`). */
  readonly enabled: boolean;

  /** Код языка перевода (`docTranslate.targetLanguage`): `ru`, `en`, `de`, `zh` и т. п. */
  readonly targetLanguage: string;

  /**
   * Базовый URL OpenAI-совместимого API (`docTranslate.apiBaseUrl`).
   * Например `https://api.deepseek.com/v1` или `http://localhost:11434/v1` для Ollama.
   */
  readonly apiBaseUrl: string;

  /** Имя модели (`docTranslate.model`), например `deepseek-chat` или `qwen2.5-coder:7b`. */
  readonly model: string;

  /**
   * Требуется ли API-ключ (`docTranslate.apiKeyRequired`).
   * Выключите для локальных серверов без авторизации — Ollama, LM Studio и подобных.
   */
  readonly apiKeyRequired: boolean;

  /** Таймаут одного запроса к API в миллисекундах (`docTranslate.timeoutMs`). */
  readonly timeoutMs: number;

  /**
   * Максимальная длина документации в символах (`docTranslate.maxDocChars`).
   * Документация длиннее этого лимита не отправляется в API и не переводится.
   */
  readonly maxDocChars: number;
}

/**
 * Reads the extension settings and normalises values that VS Code lets users
 * type freely (language codes, base URLs, numbers outside the allowed range).
 */
export function readSettings(): TranslationSettings {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    enabled: config.get<boolean>('enabled', true),
    targetLanguage: normalizeLanguage(config.get<string>('targetLanguage', 'ru')),
    apiBaseUrl: normalizeBaseUrl(config.get<string>('apiBaseUrl', DEFAULT_API_BASE_URL)),
    model: (config.get<string>('model', DEFAULT_MODEL) || DEFAULT_MODEL).trim(),
    apiKeyRequired: config.get<boolean>('apiKeyRequired', true),
    timeoutMs: clamp(config.get<number>('timeoutMs', 15000), 1000, 120000),
    maxDocChars: clamp(config.get<number>('maxDocChars', 6000), 500, 60000),
  };
}

/** Нормализует код языка к виду `ru`, `pt`, `zh`: нижний регистр, без региона. */
export function normalizeLanguage(value: string | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return 'ru';
  }
  return trimmed.split(/[-_]/)[0] || 'ru';
}

/** Убирает завершающие слэши из базового URL и подставляет DeepSeek по умолчанию. */
export function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

/** Записывает настройку в глобальный `settings.json`. */
export async function updateSetting<T>(key: string, value: T): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  if (!config.inspect(key)) {
    throw new Error(
      `настройка ${CONFIG_SECTION}.${key} ещё не зарегистрирована. ` +
        'Перезагрузите окно VS Code: Developer: Reload Window.',
    );
  }
  await config.update(key, value, vscode.ConfigurationTarget.Global);
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(Math.max(Math.round(value), minimum), maximum);
}
