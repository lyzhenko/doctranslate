import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import type * as vscode from 'vscode';
import type { TranslationSettings } from '../src/config';
import { DocumentationTranslator } from '../src/translator';
import { HOVER_DOCUMENTATION } from './fixtures';

/**
 * Exercises the real hover provider without starting VS Code. The compiled
 * module requires `vscode`, so we intercept that request with a small fake
 * that imitates `executeHoverProvider`, MarkdownString and Hover.
 */

class FakeMarkdownString {
  value = '';
  isTrusted = false;
  supportThemeIcons = false;

  appendMarkdown(value: string): this {
    this.value += value;
    return this;
  }

  appendText(value: string): this {
    this.value += value;
    return this;
  }
}

class FakeHover {
  readonly contents: FakeMarkdownString[];

  constructor(contents: FakeMarkdownString | FakeMarkdownString[]) {
    this.contents = Array.isArray(contents) ? contents : [contents];
  }
}

interface FakeToken extends vscode.CancellationToken {
  isCancellationRequested: boolean;
}

const token: FakeToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => undefined }),
};

let builtinMarkdown = '';
let nestedCalls = 0;
let nestedResult: unknown = 'not called';
let settings: TranslationSettings;
const logs: string[] = [];

const fakeVscode = {
  MarkdownString: FakeMarkdownString,
  Hover: FakeHover,
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown): unknown => {
        const value = (settings as unknown as Record<string, unknown>)[key];
        return value === undefined ? fallback : value;
      },
    }),
  },
  commands: {
    executeCommand: async (command: string, ...args: unknown[]): Promise<unknown> => {
      assert.equal(command, 'vscode.executeHoverProvider');
      nestedCalls += 1;
      nestedResult = await provider.provideHover(
        { uri: args[0], languageId: 'typescript' } as unknown as vscode.TextDocument,
        args[1] as vscode.Position,
        token,
      );
      return [new FakeHover([Object.assign(new FakeMarkdownString(), { value: builtinMarkdown })])];
    },
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (this: unknown, request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
): unknown {
  if (request === 'vscode') {
    return fakeVscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

// Required after the loader hook so that the module gets the fake `vscode`.
const { DocumentationHoverProvider } = require('../src/hoverProvider') as typeof import('../src/hoverProvider');

let provider: InstanceType<typeof DocumentationHoverProvider>;

const document = {
  uri: { toString: () => 'Untitled-1' },
  languageId: 'typescript',
} as unknown as vscode.TextDocument;
const position = { line: 5, character: 12 } as vscode.Position;

function createProvider(options: {
  translation: string;
  apiKey?: string;
  requestCount?: { value: number };
}): void {
  settings = {
    enabled: true,
    targetLanguage: 'ru',
    apiBaseUrl: 'http://127.0.0.1:9/v1',
    model: 'test-model',
    apiKeyRequired: true,
    timeoutMs: 1000,
    maxDocChars: 10000,
  };
  logs.length = 0;
  provider = new DocumentationHoverProvider(
    new DocumentationTranslator({
      settings: () => settings,
      apiKey: async () => options.apiKey,
      log: (message: string) => logs.push(message),
      request: async (_connection, messages) => {
        if (options.requestCount) {
          options.requestCount.value += 1;
        }
        return messages[1].content.replace(
          'Returns the last occurrence of a substring in the string, or -1 if it is not present.',
          options.translation,
        );
      },
    }),
    { beginWork: () => undefined, endWork: () => undefined },
    (message: string) => logs.push(message),
  );
}

test('hover provider appends a translated block and does not recurse', async () => {
  const requestCount = { value: 0 };
  createProvider({
    translation: 'Возвращает последнее вхождение подстроки в строку или -1, если её нет.',
    apiKey: 'test-key',
    requestCount,
  });
  builtinMarkdown = HOVER_DOCUMENTATION;
  nestedCalls = 0;
  nestedResult = 'not called';

  const hover = await provider.provideHover(document, position, token);

  assert.ok(hover, logs.join(' | '));
  const value = (hover.contents[0] as unknown as FakeMarkdownString).value;
  assert.match(value, /🌐 Перевод · Русский/);
  assert.match(value, /Возвращает последнее вхождение подстроки/);
  assert.match(
    value,
    /\(method\) String\.lastIndexOf\(searchString: string, position\?: number\): number/,
  );
  assert.equal(nestedCalls, 1);
  assert.equal(nestedResult, undefined, 'the nested provider call must be ignored');
  assert.equal(requestCount.value, 1);
});

test('hover provider skips documentation already in the target language', async () => {
  const requestCount = { value: 0 };
  createProvider({ translation: 'не используется', apiKey: 'test-key', requestCount });
  builtinMarkdown =
    'Возвращает последнее вхождение подстроки в строку или -1, если её нет. ' +
    'Параметр position задаёт позицию, с которой начинается поиск.';
  nestedResult = 'not called';

  const hover = await provider.provideHover(document, position, token);

  assert.equal(hover, undefined);
  assert.equal(requestCount.value, 0);
  assert.match(logs.join(' | '), /уже на языке «Русский»/);
});

test('hover provider translates Ukrainian documentation, not skipping it', async () => {
  const requestCount = { value: 0 };
  createProvider({ translation: 'не используется', apiKey: 'test-key', requestCount });
  builtinMarkdown = 'Повертає останнє входження підрядка в рядок або -1, якщо його немає.';
  nestedResult = 'not called';

  const hover = await provider.provideHover(document, position, token);

  assert.ok(hover, logs.join(' | '));
  assert.equal(requestCount.value, 1);
});

test('hover provider offers to set a key when it is missing', async () => {
  createProvider({ translation: 'не используется', apiKey: undefined });
  builtinMarkdown = HOVER_DOCUMENTATION;
  nestedResult = 'not called';

  const hover = await provider.provideHover(document, position, token);

  assert.ok(hover, logs.join(' | '));
  const value = (hover.contents[0] as unknown as FakeMarkdownString).value;
  assert.match(value, /не задан API-ключ/);
  assert.match(value, /command:docTranslate\.setApiKey/);
});


