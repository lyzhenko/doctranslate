import * as vscode from 'vscode';
import { ApiKeyStore } from './apiKeyStore';
import { registerCommands } from './commands';
import { readSettings } from './config';
import { DocumentationHoverProvider } from './hoverProvider';
import { StatusBarController } from './statusBar';
import { DocumentationTranslator } from './translator';

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel('Doc Translate');
  context.subscriptions.push(channel);

  const log = (message: string): void => {
    const time = new Date().toISOString().slice(11, 19);
    channel.appendLine(`[${time}] ${message}`);
  };

  const version = (context.extension.packageJSON as { version?: string }).version ?? '';
  log(`Doc Translate ${version} активирован`);

  const statusBar = new StatusBarController(readSettings);
  context.subscriptions.push(statusBar);

  const apiKeys = new ApiKeyStore(context.secrets);
  const translator = new DocumentationTranslator({
    settings: readSettings,
    apiKey: () => apiKeys.get(readSettings().apiBaseUrl),
    log,
  });

  const provider = new DocumentationHoverProvider(translator, statusBar, log);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider({ scheme: '*' }, provider),
  );

  registerCommands(context, {
    apiKeys,
    translator,
    statusBar,
    log,
    showLog: () => channel.show(true),
  });

  log('Готово: наведите курсор на символ с документацией.');
}

export function deactivate(): void {
  // Resources are owned by the extension context and disposed by VS Code.
}
