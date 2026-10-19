# Skycode AI

AI-агент для VS Code. Расширение `skycode.skycode-ai` в Visual Studio Marketplace, работает в обычном VS Code 1.124+. Страница для пользователей — [MARKETPLACE.md](./MARKETPLACE.md). Сайт: https://ruslansinkevich.ru/skycode/ . Исходный код: https://github.com/RuslanSinkevich/skycode .

Это индекс документации разработчика. Прежний форк VS Code (Skycode.exe, установщики) больше не выпускается.

## Быстрый старт

Из папки `extensions/skycode`:

```bash
npm ci
cd webview-ui && npm ci && cd ..
npm run protos      # после клонирования и после любых правок .proto
npm run package     # типы + webview + линт + бандл
npm run test:unit   # юнит-тесты (mocha)
```

Попробовать: `npm run package:vsix`, поставить `dist/skycode.vsix` в VS Code, затем `Developer: Reload Window`. Проверки, упаковка и релиз (тег `ext-vX.Y.Z`) — в [docs/BUILD.md](./docs/BUILD.md).

## Документация

Главная страница: [docs/README.md](./docs/README.md).

- [docs/BUILD.md](./docs/BUILD.md) — сборка, проверки, релиз
- [docs/ADDING_SETTINGS.md](./docs/ADDING_SETTINGS.md) — добавление настроек

### Архитектура
- [docs/architecture/OVERVIEW.md](./docs/architecture/OVERVIEW.md) — общий обзор
- [docs/architecture/CORE.md](./docs/architecture/CORE.md) — core модуль
- [docs/architecture/PROMPTS.md](./docs/architecture/PROMPTS.md) — система промптов
- [docs/architecture/CHAT_PIPELINE_ARCHITECTURE.md](./docs/architecture/CHAT_PIPELINE_ARCHITECTURE.md) — пайплайн чата
- [docs/architecture/CONTEXT_MANAGEMENT.md](./docs/architecture/CONTEXT_MANAGEMENT.md) — управление контекстом

### Подсистемы
- [docs/DIFF_SYSTEM.md](./docs/DIFF_SYSTEM.md) — diff-система v4
- [docs/CODE_SEARCH.md](./docs/CODE_SEARCH.md) — поиск по коду (карта репозитория)
- [docs/INDEXING_SYSTEM.md](./docs/INDEXING_SYSTEM.md) — векторный индекс (необязательно)
- [docs/TERMINAL_SYSTEM.md](./docs/TERMINAL_SYSTEM.md) — терминал и фоновые команды
- [docs/mcp/how-mcp-works.md](./docs/mcp/how-mcp-works.md) — как работает MCP

### Разработка
- [docs/development/GENERAL.md](./docs/development/GENERAL.md) — общие правила
- [docs/development/TOOLS.md](./docs/development/TOOLS.md) — добавление инструментов
- [docs/development/NETWORK.md](./docs/development/NETWORK.md) — сетевые запросы
- [docs/agent-rules/](./docs/agent-rules/) — правила для AI агента

### Планы
- [docs/plans/ROADMAP.md](./docs/plans/ROADMAP.md) — дорожная карта
- [docs/plans/TABS.md](./docs/plans/TABS.md) — вкладки сессий
- [docs/plans/implementation/](./docs/plans/implementation/) — планы реализации
