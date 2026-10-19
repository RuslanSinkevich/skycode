# Skycode AI — документация разработчика

Skycode AI — расширение VS Code (`skycode.skycode-ai`, Visual Studio Marketplace). Работает в обычном VS Code 1.124+. Страница для пользователей — [MARKETPLACE.md](../MARKETPLACE.md); исходный код — https://github.com/RuslanSinkevich/skycode ; сайт — https://ruslansinkevich.ru/skycode/ .

Прежний форк VS Code (Skycode.exe, патчи ядра) больше не выпускается и в документации не описывается.

## Что умеет

- Агент с инструментами: чтение и правка файлов, команды в терминале, поиск, браузер, MCP, Jupyter (`edit_notebook`), `read_symbol`, `show_visual`, `show_chart`.
- Пять режимов: Act, Plan, Debug, Ask, Chat (режим хранится отдельно для каждой вкладки).
- Вкладки сессий, очередь сообщений, шторка истории.
- Diff-система v4: правки агента подсвечены в редакторе, принять/отклонить — в панели Pending Changes, откат по сообщениям.
- Поиск по коду без индексации: карта репозитория (tree-sitter) + ранжированный ripgrep. Векторный индекс необязателен и выключен по умолчанию.
- 17 провайдеров моделей (`src/shared/providers/providers.json`), по умолчанию OpenAI Compatible.
- Inline Edit (`Ctrl+Shift+K`) и YAML-workflows.

## Быстрый старт разработчика

Из папки `extensions/skycode`:

```bash
npm ci
cd webview-ui && npm ci && cd ..
npm run protos
npm run package
```

Проверки и релиз — в [BUILD.md](./BUILD.md).

## Документация

### Сборка и настройка
- [BUILD.md](./BUILD.md) — сборка, проверки, упаковка .vsix, релиз
- [ADDING_SETTINGS.md](./ADDING_SETTINGS.md) — добавление настроек

### Архитектура
- [architecture/OVERVIEW.md](./architecture/OVERVIEW.md) — общий обзор
- [architecture/CORE.md](./architecture/CORE.md) — core модуль
- [architecture/PROMPTS.md](./architecture/PROMPTS.md) — система промптов
- [architecture/CHAT_PIPELINE_ARCHITECTURE.md](./architecture/CHAT_PIPELINE_ARCHITECTURE.md) — пайплайн чата (сессии, ApprovalGate)
- [architecture/CONTEXT_MANAGEMENT.md](./architecture/CONTEXT_MANAGEMENT.md) — управление контекстом (сжатие, суммаризация)

### Подсистемы
- [DIFF_SYSTEM.md](./DIFF_SYSTEM.md) — diff-система v4
- [CODE_SEARCH.md](./CODE_SEARCH.md) — поиск по коду (карта репозитория)
- [INDEXING_SYSTEM.md](./INDEXING_SYSTEM.md) — векторный индекс (необязательно)
- [TERMINAL_SYSTEM.md](./TERMINAL_SYSTEM.md) — терминал, тайминги команд, фоновые команды
- [mcp/how-mcp-works.md](./mcp/how-mcp-works.md) — как работает MCP

### Разработка
- [development/GENERAL.md](./development/GENERAL.md) — общие правила
- [development/TOOLS.md](./development/TOOLS.md) — добавление инструментов
- [development/NETWORK.md](./development/NETWORK.md) — сетевые запросы

### Правила для AI агента
- [agent-rules/general.md](./agent-rules/general.md) — общие правила
- [agent-rules/network.md](./agent-rules/network.md) — сетевые правила
- [agent-rules/protobuf.md](./agent-rules/protobuf.md) — protobuf

### Планы
- [plans/ROADMAP.md](./plans/ROADMAP.md) — дорожная карта
- [plans/TABS.md](./plans/TABS.md) — вкладки сессий
- [plans/implementation/](./plans/implementation/) — планы реализации (IMPL)

## Структура проекта

```
extensions/skycode/
├── src/
│   ├── extension.ts        # точка входа
│   ├── registry.ts         # id команд и views (префикс skycode.)
│   ├── core/               # controller, task, session, prompts, diff-v2, indexing, workflow, ...
│   ├── services/           # MCP, browser, repo-map, tree-sitter, ripgrep, dictation, ...
│   ├── hosts/vscode/       # привязки к VS Code API (terminal, webview, migrateLegacyStorage)
│   ├── integrations/       # terminal, editor, diagnostics, провайдеры-интеграции
│   └── shared/             # общие типы, proto-конверсии, настройки
├── webview-ui/             # React UI панели
├── proto/skycode/          # protobuf определения
├── assets/, vendor/, models/
├── docs/                   # эта документация
└── package.json            # манифест расширения
```

## Технологии

TypeScript, React (webview), gRPC/Protobuf между расширением и webview, esbuild, tree-sitter, ripgrep, `node:sqlite` + transformers.js (необязательный индекс).

## Лицензия

[Apache License 2.0](../LICENSE). Основано на [Cline](https://github.com/cline/cline) (Apache 2.0).
