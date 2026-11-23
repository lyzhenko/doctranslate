import { createHash } from 'node:crypto';
import type { TranslationSettings } from './config';
import { LruCache } from './cache';
import { languageDisplayName } from './language';
import {
  chatCompletionsUrl,
  requestChatCompletion,
  TranslationError,
  type ChatRequest,
  type LlmConnection,
} from './llm';
import {
  countLetters,
  findMissingTokens,
  maskMarkdown,
  normalizeModelOutput,
  restoreMarkdown,
} from './markdown';
import { buildPlaceholderRetryMessages, buildTranslationMessages, PROMPT_VERSION } from './prompt';

export interface TranslatorDependencies {
  readonly settings: () => TranslationSettings;
  readonly apiKey: () => Promise<string | undefined>;
  readonly log: (message: string) => void;
  /** Injectable for tests; defaults to the real HTTP client. */
  readonly request?: ChatRequest;
}

/**
 * Translates hover documentation, masks all code before sending anything to
 * the API, validates that placeholders survived and caches the result.
 */
export class DocumentationTranslator {
  private readonly cache: LruCache<string, string>;
  private readonly inflight = new Map<string, Promise<string>>();
  private readonly request: ChatRequest;

  constructor(
    private readonly deps: TranslatorDependencies,
    cacheCapacity = 200,
  ) {
    this.cache = new LruCache(cacheCapacity);
    this.request = deps.request ?? requestChatCompletion;
  }

  clearCache(): void {
    this.cache.clear();
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  async translate(markdown: string, signal?: AbortSignal): Promise<string> {
    const settings = this.deps.settings();
    if (countLetters(markdown) === 0) {
      throw new TranslationError('format', 'В документации нет текста для перевода.');
    }
    if (markdown.length > settings.maxDocChars) {
      throw new TranslationError(
        'too-long',
        `Документация длиннее ${settings.maxDocChars} символов — перевод пропущен.`,
      );
    }

    const key = this.cacheKey(markdown, settings);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.deps.log('Перевод взят из кэша');
      return cached;
    }

    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }

    const task = this.performTranslation(markdown, settings, signal)
      .then((translated) => {
        this.cache.set(key, translated);
        return translated;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, task);
    return task;
  }

  private async performTranslation(
    markdown: string,
    settings: TranslationSettings,
    signal?: AbortSignal,
  ): Promise<string> {
    const apiKey = await this.deps.apiKey();
    if (!apiKey && settings.apiKeyRequired) {
      throw new TranslationError(
        'no-key',
        'Не задан API-ключ. Установите ключ командой «Doc Translate: Установить API-ключ».',
      );
    }

    const masked = maskMarkdown(markdown);
    const targetName = languageDisplayName(settings.targetLanguage);
    const connection: LlmConnection = {
      baseUrl: settings.apiBaseUrl,
      model: settings.model,
      timeoutMs: settings.timeoutMs,
      apiKey: apiKey ?? '',
    };

    const startedAt = Date.now();
    let answer = normalizeModelOutput(
      await this.request(
        connection,
        buildTranslationMessages(masked.maskedText, targetName, settings.targetLanguage),
        signal,
      ),
    );

    let missing = findMissingTokens(masked.maskedText, answer);
    if (missing.length > 0) {
      this.deps.log(`Модель потеряла маркеры (${missing.join(', ')}), повторный запрос`);
      answer = normalizeModelOutput(
        await this.request(
          connection,
          buildPlaceholderRetryMessages(
            masked.maskedText,
            answer,
            missing,
            targetName,
            settings.targetLanguage,
          ),
          signal,
        ),
      );
      missing = findMissingTokens(masked.maskedText, answer);
      if (missing.length > 0) {
        throw new TranslationError(
          'format',
          'Модель не сохранила разметку перевода, попробуйте другую модель.',
        );
      }
    }

    const restored = restoreMarkdown(answer, masked.tokens);
    if (!restored.trim()) {
      throw new TranslationError('format', 'Модель вернула пустой перевод.');
    }

    this.deps.log(
      `Переведено ${markdown.length} → ${restored.length} симв. ` +
        `за ${Date.now() - startedAt} мс (${settings.targetLanguage}, ${settings.model})`,
    );
    return restored;
  }

  private cacheKey(markdown: string, settings: TranslationSettings): string {
    return createHash('sha256')
      .update(
        [
          PROMPT_VERSION,
          settings.targetLanguage,
          settings.model,
          chatCompletionsUrl(settings.apiBaseUrl),
          markdown,
        ].join('\u0000'),
      )
      .digest('hex');
  }
}
