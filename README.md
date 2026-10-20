# Skycode AI

> English version: [README.en.md](README.en.md)

**AI-агент для VS Code под ваши модели**

Skycode — расширение VS Code (`skycode.skycode-ai`, в Marketplace — «Skycode AI»). Подключается к OpenAI-совместимому шлюзу (vLLM, LiteLLM), локальной модели (Ollama, LM Studio) или облачным провайдерам — GigaChat, YandexGPT, OpenRouter и другим. Без аккаунтов и подписок. Основано на [Cline](https://github.com/cline/cline), лицензия Apache 2.0.

<p align="center">
  <img src="./docs/skycode/hero-demo.gif" alt="Skycode AI в работе" width="900">
</p>

<p align="center">
  <a href="https://ruslansinkevich.ru/skycode/">Сайт</a> ·
  <a href="https://marketplace.visualstudio.com/items?itemName=skycode.skycode-ai">Marketplace</a> ·
  <a href="#документация">Документация</a> ·
  <a href="./README.en.md">English</a> ·
  <a href="https://github.com/RuslanSinkevich/skycode">GitHub</a>
</p>

---

## Возможности

### AI-агент с 30+ инструментами

| Возможность | Описание |
|-----------|-------------|
| **Чтение и правка файлов** | Создание файлов, замена блоков, патчи |
| **Выполнение команд** | Терминал: сборка, тесты, git, npm, Docker |
| **Поиск по коду** | `codebase_search`: карта репозитория (tree-sitter) + ripgrep; опционально векторный индекс |
| **Поиск по regex** | Быстрый поиск по шаблону через ripgrep |
| **Веб-поиск** | Поиск информации в интернете |
| **Автоматизация браузера** | Puppeteer: скриншоты, клики, заполнение форм |
| **MCP-интеграции** | Подключение внешних сервисов (Context7, базы данных, API) |
| **Диагностика** | Чтение ошибок ESLint, TypeScript и других линтеров |
| **Jupyter Notebooks** | Создание и редактирование ячеек |

### 5 режимов работы

| Режим | Назначение | Инструменты |
|------|---------|-------|
| **Act** | По умолчанию. Выполнение задач, правка файлов, запуск команд | Все |
| **Ask** | Изучение кода, ответы на вопросы | Только чтение |
| **Plan** | Сбор информации, проектирование решения | Только чтение + `plan_mode_respond` |
| **Debug** | Систематическая отладка на реальных данных выполнения | Только чтение + `execute_command` |
| **Chat** | Обычный разговор на любую тему | Только чтение (по явной просьбе) |

Агент может сам переключаться между режимами по ходу разговора.

### Inline Diff System v4

- Изменения от AI показываются **прямо в редакторе** (зелёное — добавлено, красное — удалено)
- Кнопки **Принять / Отклонить** для каждого блока изменений
- Снимки состояния на каждое сообщение для точного отката
- Навигация между ожидающими изменениями в разных файлах

### Поиск по коду

- `codebase_search` работает без индексации: карта репозитория (объявления через tree-sitter) и текстовый поиск ripgrep
- Опциональный векторный индекс (`skycode.indexing.mode`): гибридный поиск — семантический + по ключевым словам + переранжирование
- Индексация по умолчанию выключена. Режим `remote` — любой OpenAI-совместимый embeddings API. Режим `local` в сборках из Marketplace не работает: локальная модель и onnxruntime-node в VSIX не входят
- Инкрементальное обновление через FileWatcher

### Провайдеры

Провайдер по умолчанию — **OpenAI Compatible**; остальные — в разделе «Ещё провайдеры».

- Шлюзы с Qwen-подобными моделями (vLLM, LiteLLM) — основной целевой сценарий
- Локальные модели — Ollama, LM Studio
- **GigaChat** — нативные function calls (Сбер)
- **YandexGPT**
- **OpenRouter** — агрегатор моделей
- OpenAI, Anthropic, Google и другие облачные API

### Голосовой ввод

Локальное распознавание речи (whisper.cpp).

### Облегчённый режим

Упрощённые промпты и инструменты для слабых и бесплатных моделей. 11 вариантов промптов, оптимизированных под конкретные семейства моделей.

---

## Установка

Нужен VS Code 1.90 или новее.

- **Из Marketplace:** вкладка «Расширения» → поиск «Skycode AI» → Установить. Страница: [marketplace.visualstudio.com/items?itemName=skycode.skycode-ai](https://marketplace.visualstudio.com/items?itemName=skycode.skycode-ai)
- **Из .vsix:** «Расширения» → `…` → «Установить из VSIX…» (файл прикладывается к [GitHub Release](https://github.com/RuslanSinkevich/skycode/releases) каждой версии)

Затем: панель **Skycode** на боковой панели → шестерёнка → **Провайдер** → адрес шлюза, ключ API и имя модели.

## Сборка из исходников

Продукт живёт в `extensions/skycode/`. Репозиторий физически остаётся форком VS Code, но остальное дерево (`src/vs/`, `build/` и т. д.) для Skycode не используется.

```bash
cd extensions/skycode
npm ci
cd webview-ui && npm ci && cd ..
npm run protos
npm run package                                   # типы + webview + lint + esbuild
npx vsce package --readme-path MARKETPLACE.md     # .vsix
```

Подробнее — в [руководстве по разработке](./docs/skycode/development/getting-started.md).

---

## Архитектура

```
┌──────────────────────────────────────────────┐
│  VS Code                                      │
│  ┌──────────────────────────────────────┐    │
│  │  Skycode Extension                    │    │
│  │  ┌────────┐ ┌──────┐ ┌───────────┐  │    │
│  │  │ Agent  │ │ Diff │ │ Indexing  │  │    │
│  │  │ Loop   │ │ v4   │ │ (SQLite)  │  │    │
│  │  └───┬────┘ └──────┘ └───────────┘  │    │
│  │      ↓                               │    │
│  │  ┌────────┐ ┌──────┐ ┌───────────┐  │    │
│  │  │ 40+   │ │ MCP  │ │ Prompts   │  │    │
│  │  │ APIs  │ │ Hub  │ │ Engine    │  │    │
│  │  └────────┘ └──────┘ └───────────┘  │    │
│  └──────────────────────────────────────┘    │
│                    ↕ gRPC                     │
│  ┌──────────────────────────────────────┐    │
│  │  Webview UI (React)                  │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

| Компонент | Технология |
|-----------|-----------|
| Платформа | Расширение VS Code (1.90+) |
| Связь | gRPC + Protobuf |
| UI чата | React |
| Разбор кода | Tree-sitter |
| Поиск | Карта репозитория + ripgrep, опционально индекс embeddings |

---

## Документация

> **English documentation:** [docs/skycode/en/](./docs/skycode/en/architecture/overview.md)

### Архитектура
- [Обзор архитектуры](./docs/skycode/architecture/overview.md)
- [Модуль Core](./docs/skycode/architecture/core.md)
- [Управление контекстом](./docs/skycode/architecture/context-management.md)

### Системы
- [Inline Diff System v4](./docs/skycode/systems/diff-system.md)
- [Индексация кодовой базы](./docs/skycode/systems/indexing-system.md)
- [Интеграция MCP](./docs/skycode/systems/mcp.md)

### Разработка
- [Руководство по разработке](./docs/skycode/development/getting-started.md)
- [Добавление инструментов агента](./docs/skycode/development/adding-tools.md)
- [Сетевые запросы и прокси](./docs/skycode/development/network.md)
- [Добавление настроек](./docs/skycode/development/adding-settings.md)

---

## Участие в разработке

Настройка окружения, стиль кода и правила PR — в [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Благодарности

Skycode построен на нескольких open-source проектах:

- [Cline](https://github.com/cline/cline) (Apache 2.0) — исходная архитектура расширения
- [Continue](https://github.com/continuedev/continue) (Apache 2.0) — pipeline embeddings
- [Kilocode](https://github.com/Kilo-Org/kilocode) (Apache 2.0 / MIT) — паттерны работы с инструментами

Полный список — в [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Лицензия

[Apache License 2.0](./LICENSE)
