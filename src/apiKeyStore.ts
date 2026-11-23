import type * as vscode from 'vscode';
import { normalizeBaseUrl } from './config';

const SECRET_PREFIX = 'docTranslate.apiKey:';

export function secretStorageKey(baseUrl: string): string {
  return `${SECRET_PREFIX}${normalizeBaseUrl(baseUrl).toLowerCase()}`;
}

/**
 * Keeps API keys in VS Code SecretStorage (OS keychain backed) and supports
 * environment variables for CI or users who prefer not to store keys at all.
 */
export class ApiKeyStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async get(baseUrl: string): Promise<string | undefined> {
    const stored = await this.secrets.get(secretStorageKey(baseUrl));
    if (stored && stored.trim()) {
      return stored.trim();
    }
    const fromEnvironment =
      process.env.DOC_TRANSLATE_API_KEY?.trim() ||
      (isDeepSeekBase(baseUrl) ? process.env.DEEPSEEK_API_KEY?.trim() : undefined);
    return fromEnvironment || undefined;
  }

  async set(baseUrl: string, apiKey: string): Promise<void> {
    const key = apiKey.trim();
    if (key) {
      await this.secrets.store(secretStorageKey(baseUrl), key);
    } else {
      await this.secrets.delete(secretStorageKey(baseUrl));
    }
  }

  async clear(baseUrl: string): Promise<void> {
    await this.secrets.delete(secretStorageKey(baseUrl));
  }
}

function isDeepSeekBase(baseUrl: string): boolean {
  return /(^|\.)deepseek\.com/i.test(baseUrl);
}
