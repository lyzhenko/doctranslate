import * as vscode from 'vscode';
import type { TranslationSettings } from './config';
import { readSettings } from './config';
import { readHoverDocumentation } from './documentation';
import { detectLanguage, languageDisplayName } from './language';
import { TranslationError } from './llm';
import { countLetters, maskMarkdown } from './markdown';
import type { DocumentationTranslator } from './translator';

export interface WorkIndicator {
  beginWork(): void;
  endWork(): void;
}

/**
 * Adds a translated section to the documentation hover.
 *
 * VS Code merges hovers from all providers, so this provider does not try to
 * replace the built-in hover. It asks all providers for their hovers (with a
 * recursion guard), translates the prose and appends the result.
 */
export class DocumentationHoverProvider implements vscode.HoverProvider {
  private readonly activeHoverKeys = new Set<string>();

  constructor(
    private readonly translator: DocumentationTranslator,
    private readonly status: WorkIndicator,
    private readonly log: (message: string) => void,
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    const settings = readSettings();
    if (!settings.enabled) {
      return undefined;
    }

    // `vscode.executeHoverProvider` below calls this provider again for the
    // same position; the key guards against unbounded recursion.
    const hoverKey = `${document.uri.toString()}:${position.line}:${position.character}`;
    if (this.activeHoverKeys.has(hoverKey)) {
      return undefined;
    }
    this.activeHoverKeys.add(hoverKey);

    try {
      const documentation = await readHoverDocumentation(document, position);
      if (!documentation) {
        return undefined;
      }

      if (documentation.length > settings.maxDocChars) {
        this.log(
          `Документация ${documentation.length} симв. длиннее лимита ` +
            `${settings.maxDocChars}, перевод пропущен`,
        );
        return undefined;
      }

      const { maskedText } = maskMarkdown(documentation);
      if (countLetters(maskedText) < 3) {
        return undefined;
      }
      const guess = detectLanguage(maskedText);
      if (guess && guess.code === settings.targetLanguage) {
        this.log(
          `Документация уже на языке «${languageDisplayName(guess.code)}» — перевод не нужен`,
        );
        return undefined;
      }
      if (token.isCancellationRequested) {
        return undefined;
      }

      const controller = new AbortController();
      const cancellation = token.onCancellationRequested(() => controller.abort());
      this.status.beginWork();
      try {
        const translated = await this.translator.translate(documentation, controller.signal);
        if (token.isCancellationRequested) {
          return undefined;
        }
        return buildTranslationHover(translated, settings);
      } catch (error) {
        if (isCancellation(error, token)) {
          return undefined;
        }
        this.log(`Ошибка перевода: ${describe(error)}`);
        return buildErrorHover(error);
      } finally {
        this.status.endWork();
        cancellation.dispose();
      }
    } catch (error) {
      this.log(`Не удалось получить документацию: ${describe(error)}`);
      return undefined;
    } finally {
      this.activeHoverKeys.delete(hoverKey);
    }
  }
}

function buildTranslationHover(translated: string, settings: TranslationSettings): vscode.Hover {
  const language = languageDisplayName(settings.targetLanguage);
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.supportThemeIcons = true;
  markdown.appendMarkdown(`**🌐 Перевод · ${language}** · [выключить](command:docTranslate.toggle)`);
  markdown.appendMarkdown('\n\n');
  markdown.appendMarkdown(translated);
  return new vscode.Hover(markdown);
}

function buildErrorHover(error: unknown): vscode.Hover {
  const markdown = new vscode.MarkdownString();
  markdown.isTrusted = true;
  markdown.supportThemeIcons = true;

  if (error instanceof TranslationError && error.code === 'no-key') {
    markdown.appendMarkdown(
      '**🌐 Перевод:** не задан API-ключ. ' +
        '[Установить ключ](command:docTranslate.setApiKey) · ' +
        '[Выбрать провайдера](command:docTranslate.configure)',
    );
    return new vscode.Hover(markdown);
  }

  if (error instanceof TranslationError && error.code === 'auth') {
    markdown.appendMarkdown(
      '**🌐 Перевод:** API-ключ не принят. ' +
        '[Проверить ключ](command:docTranslate.setApiKey) · ' +
        '[Настройки](command:docTranslate.configure)',
    );
    return new vscode.Hover(markdown);
  }

  const message = error instanceof Error ? error.message : String(error);
  markdown.appendMarkdown('**🌐 Перевод недоступен:** ');
  markdown.appendText(truncate(message, 300));
  markdown.appendMarkdown(' · [Настроить](command:docTranslate.configure)');
  return new vscode.Hover(markdown);
}

function isCancellation(error: unknown, token: vscode.CancellationToken): boolean {
  return (
    token.isCancellationRequested ||
    (error instanceof TranslationError && error.code === 'aborted')
  );
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
