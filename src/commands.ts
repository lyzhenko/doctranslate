import * as vscode from 'vscode';
import type { ApiKeyStore } from './apiKeyStore';
import { normalizeBaseUrl, readSettings, updateSetting } from './config';
import { languageDisplayName } from './language';
import type { StatusBarController } from './statusBar';
import type { DocumentationTranslator } from './translator';

interface ProviderPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly needsKey: boolean;
}

const PRESETS: readonly ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'deepseek-chat · api.deepseek.com',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    needsKey: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'gpt-4o-mini · api.openai.com',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsKey: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'openai/gpt-4o-mini · openrouter.ai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    needsKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (локально)',
    description: 'qwen2.5-coder:7b · localhost:11434',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5-coder:7b',
    needsKey: false,
  },
];

const LANGUAGES: readonly { code: string; name: string }[] = [
  { code: 'ru', name: 'Русский' },
  { code: 'en', name: 'English' },
  { code: 'uk', name: 'Українська' },
  { code: 'kk', name: 'Қазақша' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pl', name: 'Polski' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
];

export interface CommandDependencies {
  readonly apiKeys: ApiKeyStore;
  readonly translator: DocumentationTranslator;
  readonly statusBar: StatusBarController;
  readonly log: (message: string) => void;
  readonly showLog: () => void;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDependencies,
): void {
  const { apiKeys, translator, statusBar, log } = deps;

  const register = (id: string, handler: (...args: unknown[]) => void | Promise<void>): void => {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: unknown[]) => {
        try {
          await handler(...args);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log(`Команда ${id}: ${message}`);
          void vscode.window.showErrorMessage(`Doc Translate: ${message}`);
        }
      }),
    );
  };

  register('docTranslate.toggle', async () => {
    const settings = readSettings();
    await updateSetting('enabled', !settings.enabled);
    statusBar.refresh();
    void vscode.window.setStatusBarMessage(
      settings.enabled
        ? 'Doc Translate: перевод документации выключен'
        : 'Doc Translate: перевод документации включён',
      3000,
    );
    log(`Перевод ${settings.enabled ? 'выключен' : 'включён'}`);
  });

  register('docTranslate.configure', async () => {
    const items: Array<vscode.QuickPickItem & { preset: ProviderPreset }> = PRESETS.map(
      (preset) => ({
        label: preset.label,
        description: preset.description,
        detail: `${preset.baseUrl}/chat/completions · модель ${preset.model}`,
        preset,
      }),
    );
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Doc Translate: провайдер перевода',
      placeHolder: 'OpenAI-совместимый сервис',
      ignoreFocusOut: true,
    });
    if (!picked) {
      return;
    }

    await updateSetting('apiBaseUrl', picked.preset.baseUrl);
    await updateSetting('model', picked.preset.model);
    await updateSetting('apiKeyRequired', picked.preset.needsKey);
    statusBar.refresh();
    log(`Провайдер: ${picked.preset.label} (${picked.preset.baseUrl}, ${picked.preset.model})`);

    let keyNote = '';
    if (picked.preset.needsKey) {
      const existing = await apiKeys.get(picked.preset.baseUrl);
      if (!existing) {
        const saved = await askForApiKey(apiKeys, picked.preset.baseUrl);
        keyNote = saved ? ' Ключ сохранён.' : ' Не забудьте установить API-ключ.';
      }
    } else {
      keyNote = ' Ключ не требуется.';
    }

    void vscode.window.showInformationMessage(
      `Doc Translate: выбран ${picked.preset.label} (${picked.preset.model}).${keyNote}`,
    );
  });

  register('docTranslate.setApiKey', async () => {
    const settings = readSettings();
    const saved = await askForApiKey(apiKeys, settings.apiBaseUrl);
    if (!saved) {
      return;
    }
    statusBar.refresh();
    void vscode.window.showInformationMessage(
      `Doc Translate: ключ сохранён для ${settings.apiBaseUrl}.`,
    );
  });

  register('docTranslate.selectLanguage', async () => {
    const current = readSettings().targetLanguage;
    const items: Array<vscode.QuickPickItem & { code: string }> = LANGUAGES.map((language) => ({
      label: language.name,
      description: language.code === current ? 'текущий' : language.code,
      code: language.code,
    }));
    items.push({
      label: 'Другой язык…',
      description: 'ввести код вручную',
      code: '__custom',
    });

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Doc Translate: язык перевода',
      placeHolder: 'На какой язык переводить документацию?',
      ignoreFocusOut: true,
    });
    if (!picked) {
      return;
    }

    let code = picked.code;
    if (code === '__custom') {
      const input = await vscode.window.showInputBox({
        title: 'Doc Translate: код языка',
        prompt: 'Например: pt, pt-BR, zh, tr',
        value: current,
        ignoreFocusOut: true,
        validateInput: (value) =>
          /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(value.trim())
            ? undefined
            : 'Нужен код языка, например ru или pt-BR',
      });
      if (!input) {
        return;
      }
      code = input.trim();
    }

    await updateSetting('targetLanguage', code.toLowerCase());
    statusBar.refresh();
    void vscode.window.showInformationMessage(
      `Doc Translate: язык перевода — ${languageDisplayName(code)}.`,
    );
    log(`Язык перевода: ${code}`);
  });

  register('docTranslate.clearCache', () => {
    const size = translator.cacheSize;
    translator.clearCache();
    statusBar.refresh();
    void vscode.window.showInformationMessage(
      `Doc Translate: кэш переводов очищен (${size} записей).`,
    );
    log(`Кэш очищен (${size} записей)`);
  });

  register('docTranslate.showLog', () => {
    deps.showLog();
  });

  register('docTranslate.menu', async () => {
    const settings = readSettings();
    const items: Array<vscode.QuickPickItem & { commandId: string }> = [
      {
        label: `Перевод: ${settings.enabled ? 'включён' : 'выключен'}`,
        description: 'нажмите, чтобы переключить',
        commandId: 'docTranslate.toggle',
      },
      {
        label: `Язык перевода: ${languageDisplayName(settings.targetLanguage)}`,
        commandId: 'docTranslate.selectLanguage',
      },
      {
        label: `Провайдер: ${settings.model}`,
        description: normalizeBaseUrl(settings.apiBaseUrl),
        commandId: 'docTranslate.configure',
      },
      { label: 'Установить API-ключ', commandId: 'docTranslate.setApiKey' },
      { label: 'Очистить кэш переводов', commandId: 'docTranslate.clearCache' },
      { label: 'Показать журнал', commandId: 'docTranslate.showLog' },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Doc Translate',
      placeHolder: 'Действие',
      ignoreFocusOut: true,
    });
    if (picked) {
      await vscode.commands.executeCommand(picked.commandId);
    }
  });
}

async function askForApiKey(apiKeys: ApiKeyStore, baseUrl: string): Promise<boolean> {
  const existing = await apiKeys.get(baseUrl);
  const value = await vscode.window.showInputBox({
    title: 'Doc Translate: API-ключ',
    prompt: existing
      ? `Ключ для ${baseUrl} уже сохранён. Введите новый, чтобы заменить.`
      : `Ключ для ${baseUrl}. Хранится в защищённом хранилище VS Code (SecretStorage).`,
    password: true,
    ignoreFocusOut: true,
    placeHolder: existing ? 'ключ сохранён — введите новый для замены' : 'sk-…',
    validateInput: (input) =>
      input.trim().length >= 8 ? undefined : 'Ключ короче 8 символов — проверьте ввод',
  });
  if (value === undefined) {
    return false;
  }
  await apiKeys.set(baseUrl, value);
  return true;
}
