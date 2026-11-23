import type { ChatMessage } from './prompt';

export type TranslationErrorCode =
  | 'no-key'
  | 'auth'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'http'
  | 'response'
  | 'format'
  | 'aborted'
  | 'too-long';

export class TranslationError extends Error {
  constructor(
    readonly code: TranslationErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

export interface LlmConnection {
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly apiKey: string;
}

export type ChatRequest = (
  connection: LlmConnection,
  messages: readonly ChatMessage[],
  signal?: AbortSignal,
) => Promise<string>;

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

/**
 * Calls an OpenAI-compatible `/chat/completions` endpoint.
 *
 * Retries once on 429 and 5xx answers, enforces an overall timeout, supports
 * cancellation through `externalSignal` and maps failures to TranslationError
 * so the UI can show a useful hint instead of a raw stack trace.
 */
export async function requestChatCompletion(
  connection: LlmConnection,
  messages: readonly ChatMessage[],
  externalSignal?: AbortSignal,
): Promise<string> {
  const url = chatCompletionsUrl(connection.baseUrl);
  const controller = new AbortController();
  let timedOut = false;
  let externallyAborted = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, connection.timeoutMs);

  const onExternalAbort = (): void => {
    externallyAborted = true;
    controller.abort();
  };
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (connection.apiKey) {
    headers.Authorization = `Bearer ${connection.apiKey}`;
  }
  const body = JSON.stringify({
    model: connection.model,
    messages,
    temperature: 0.2,
    stream: false,
  });

  let lastError: TranslationError | undefined;

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          break;
        }
        lastError = new TranslationError(
          'network',
          `Не удалось связаться с API: ${describeError(error)}`,
        );
        if (attempt === 2) {
          throw lastError;
        }
        await delay(700, controller.signal).catch(() => undefined);
        continue;
      }

      if (!response.ok) {
        const detail = (await safeReadText(response)).slice(0, 400);
        const mapped = mapHttpError(response.status, detail);
        if ((response.status === 429 || response.status >= 500) && attempt === 1) {
          lastError = mapped;
          await delay(700, controller.signal).catch(() => undefined);
          continue;
        }
        throw mapped;
      }

      let data: unknown;
      try {
        data = (await response.json()) as unknown;
      } catch {
        throw new TranslationError('response', 'API вернул ответ, который не является JSON.');
      }
      const content = extractContent(data);
      if (!content.trim()) {
        throw new TranslationError('response', 'API вернул пустой перевод.');
      }
      return content;
    }

    if (timedOut) {
      throw new TranslationError(
        'timeout',
        `Запрос к API не уложился в ${connection.timeoutMs} мс.`,
      );
    }
    if (externallyAborted) {
      throw new TranslationError('aborted', 'Запрос отменён.');
    }
    throw lastError ?? new TranslationError('aborted', 'Запрос отменён.');
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

function mapHttpError(status: number, detail: string): TranslationError {
  const suffix = detail ? ` Ответ API: ${detail}` : '';
  if (status === 401 || status === 403) {
    return new TranslationError(
      'auth',
      `API-ключ не принят (HTTP ${status}). Проверьте ключ и провайдера.${suffix}`,
      status,
    );
  }
  if (status === 404) {
    return new TranslationError(
      'http',
      `HTTP 404 — проверьте docTranslate.apiBaseUrl.${suffix}`,
      status,
    );
  }
  if (status === 429) {
    return new TranslationError(
      'rate-limit',
      `API ограничил частоту запросов (HTTP 429). Попробуйте позже.${suffix}`,
      status,
    );
  }
  return new TranslationError('http', `API вернул HTTP ${status}.${suffix}`, status);
}

function extractContent(data: unknown): string {
  if (!isRecord(data)) {
    throw new TranslationError('response', 'Не удалось разобрать ответ API.');
  }
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new TranslationError('response', 'В ответе API нет поля choices.');
  }
  const first = choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    throw new TranslationError('response', 'В ответе API нет message.');
  }
  const content = first.message.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  throw new TranslationError('response', 'Не удалось прочитать текст ответа API.');
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = (): void => {
      cleanup();
      reject(new Error('aborted'));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
