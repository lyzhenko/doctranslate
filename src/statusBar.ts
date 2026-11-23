import * as vscode from 'vscode';
import type { TranslationSettings } from './config';
import { languageDisplayName } from './language';

/** Status bar entry: language indicator, spinner while translating, menu on click. */
export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly configurationListener: vscode.Disposable;
  private busy = 0;

  constructor(private readonly getSettings: () => TranslationSettings) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'docTranslate.menu';
    this.configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('docTranslate')) {
        this.refresh();
      }
    });
    this.refresh();
    this.item.show();
  }

  beginWork(): void {
    this.busy += 1;
    this.refresh();
  }

  endWork(): void {
    this.busy = Math.max(0, this.busy - 1);
    this.refresh();
  }

  refresh(): void {
    const settings = this.getSettings();
    const language = languageDisplayName(settings.targetLanguage);

    if (!settings.enabled) {
      this.item.text = '$(circle-slash) Doc Translate';
      this.item.tooltip = new vscode.MarkdownString(
        `**Doc Translate выключен**\n\nЯзык: ${language}\n\nНажмите, чтобы открыть меню.`,
      );
      return;
    }

    if (this.busy > 0) {
      this.item.text = '$(sync~spin) Doc Translate';
      this.item.tooltip = `Перевод документации на ${language}…`;
      return;
    }

    this.item.text = `$(globe) ${settings.targetLanguage.toUpperCase()}`;
    this.item.tooltip = new vscode.MarkdownString(
      `**Doc Translate**\n\nЯзык: ${language}\nМодель: \`${settings.model}\`\n\n` +
        'Нажмите, чтобы открыть меню.',
    );
  }

  dispose(): void {
    this.configurationListener.dispose();
    this.item.dispose();
  }
}
