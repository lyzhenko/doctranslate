# Contributing

Спасибо за интерес к Doc Translate. Ниже — короткий путь от идеи до pull request.

## Разработка

```powershell
git clone https://github.com/lyzhenko/doctranslate.git
cd doctranslate
npm ci
npm run compile
```

Запуск расширения: откройте папку в VS Code и нажмите **F5** — стартует Extension Development
Host. Настройки провайдера задаются так же, как в обычном окне.

## Проверки перед PR

```powershell
npm test
npm run e2e
npm run package
```

CI прогоняет те же команды на Node.js 22. Пожалуйста, добавляйте тесты на новое поведение
(маскирование, кэш, HTTP-ошибки, рендер Markdown).

## Правила

- не коммитьте `node_modules`, `out` и `*.vsix` — они в `.gitignore`;
- не коммитьте API-ключи и токены;
- один PR — одна логическая правка;
- описывайте в PR, что изменилось и как это проверить.

## Идеи и баги

Открывайте [issue](https://github.com/lyzhenko/doctranslate/issues) с версией VS Code, провайдером
и шагами воспроизведения. Для ошибок API приложите строки из канала вывода **Doc Translate**
(без ключа).
