# Skycode AI

AI-агент для VS Code. Расширение `skycode.skycode-ai` в Visual Studio Marketplace, работает в обычном VS Code 1.90+. Страница для пользователей — [MARKETPLACE.md](../../MARKETPLACE.md), история версий — [CHANGELOG.md](../../CHANGELOG.md). Сайт: https://ruslansinkevich.ru/skycode/ . Исходный код: https://github.com/RuslanSinkevich/skycode .

Это индекс документации разработчика. Прежний форк VS Code (Skycode.exe, установщики) больше не выпускается.

## Быстрый старт

Из корня репозитория:

```bash
npm ci
cd webview-ui && npm ci && cd ..
npm run protos      # после клонирования и после любых правок .proto
npm run package     # типы + webview + линт + бандл
npm run test:unit   # юнит-тесты (mocha)
```

Попробовать: `npm run package:vsix`, поставить `dist/skycode.vsix` в VS Code, затем `Developer: Reload Window`. Проверки, упаковка и релиз (тег `ext-vX.Y.Z`, workflow `.github/workflows/skycode-extension.yml`) — в [docs/BUILD.md](./BUILD.md). При релизе нужно поднять `version` в `package.json` и дописать запись в [CHANGELOG.md](../../CHANGELOG.md).

## Документация

Главная страница: [docs/README.md](./README.md).

- [docs/BUILD.md](./BUILD.md) — сборка, проверки, релиз
- [docs/ADDING_SETTINGS.md](./ADDING_SETTINGS.md) — добавление настроек

### Архитектура
- [docs/architecture/OVERVIEW.md](./architecture/OVERVIEW.md) — общий обзор
- [docs/architecture/CORE.md](./architecture/CORE.md) — core модуль
- [docs/architecture/PROMPTS.md](./architecture/PROMPTS.md) — система промптов
- [docs/architecture/CHAT_PIPELINE_ARCHITECTURE.md](./architecture/CHAT_PIPELINE_ARCHITECTURE.md) — пайплайн чата
- [docs/architecture/CONTEXT_MANAGEMENT.md](./architecture/CONTEXT_MANAGEMENT.md) — управление контекстом

### Подсистемы
- [docs/DIFF_SYSTEM.md](./DIFF_SYSTEM.md) — система diff: подсветка в редакторе, панель изменений, откат
- [docs/VOICE_INPUT.md](./VOICE_INPUT.md) — голосовой ввод GigaAM (sherpa-onnx)
- [docs/CODE_SEARCH.md](./CODE_SEARCH.md) — поиск по коду (карта репозитория)
- [docs/INDEXING_SYSTEM.md](./INDEXING_SYSTEM.md) — векторный индекс (необязательно)
- [docs/TERMINAL_SYSTEM.md](./TERMINAL_SYSTEM.md) — терминал и фоновые команды
- [docs/mcp/how-mcp-works.md](./mcp/how-mcp-works.md) — как работает MCP

### Разработка
- [docs/development/GENERAL.md](./development/GENERAL.md) — общие правила
- [docs/development/TOOLS.md](./development/TOOLS.md) — добавление инструментов
- [docs/development/NETWORK.md](./development/NETWORK.md) — сетевые запросы
- [docs/agent-rules/](./agent-rules/) — правила для AI агента

### Планы
- [docs/plans/ROADMAP.md](./plans/ROADMAP.md) — дорожная карта
- [docs/plans/TABS.md](./plans/TABS.md) — вкладки сессий
- [docs/plans/implementation/](./plans/implementation/) — планы реализации
