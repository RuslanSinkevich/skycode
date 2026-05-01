# Архитектура Skycode AI

## Обзор

Skycode AI — это расширение VS Code, состоящее из трёх основных частей:
- **Core Extension** (бэкенд на Node.js)
- **Webview UI** (фронтенд на React)
- **Indexing Subsystem** (семантический поиск и локальные эмбеддинги)

## Диаграмма архитектуры

```
┌─────────────────────────────────────────────────────────────────┐
│  VS Code Extension Host                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Core Extension                                          │   │
│  │  ┌──────────────┐  ┌────────────┐  ┌─────────────────┐  │   │
│  │  │ Extension.ts │→ │ Webview    │→ │ Controller      │  │   │
│  │  │ (точка входа)│  │ Provider   │  │ (управление)    │  │   │
│  │  └──────────────┘  └────────────┘  └────────┬────────┘  │   │
│  │                                              ↓           │   │
│  │  ┌──────────────┐  ┌────────────┐  ┌─────────────────┐  │   │
│  │  │ Indexing     │← │ Task       │← │ API Handlers    │  │   │
│  │  │ (semantic)   │  │ (задачи)   │  │ (провайдеры)    │  │   │
│  │  └──────────────┘  └────────────┘  └─────────────────┘  │   │
│  │          ↑                                  ↓           │   │
│  │  ┌───────┴──────┐                  ┌─────────────────┐  │   │
│  │  │ Storage      │                  │ McpHub          │  │   │
│  │  │ (SQLite/JSON)│                  │ (MCP серверы)   │  │   │
│  │  └──────────────┘                  └─────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↕ gRPC/postMessage                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Webview UI (React)                                      │   │
│  │  ┌──────────────────┐  ┌─────────────────────────────┐  │   │
│  │  │ ExtensionState   │→ │ React Components            │  │   │
│  │  │ Context          │  │ (Chat, Settings, History)   │  │   │
│  │  └──────────────────┘  └─────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Ключевые компоненты

### 1. Extension Entry (`src/extension.ts`)
Точка входа расширения. Активирует расширение и создаёт WebviewProvider.

### 2. WebviewProvider (`src/core/webview/index.ts`)
Управляет жизненным циклом webview:
- Создание HTML с CSP заголовками
- Обработка сообщений от webview
- Hot Module Replacement для разработки

### 3. Controller (`src/core/controller/index.ts`)
Центральный координатор:
- Управление состоянием (GlobalState, Secrets)
- Создание и управление задачами (Task)
- Координация MCP серверов
- Синхронизация состояния с webview

### 4. Task (`src/core/task/index.ts`)
Выполнение AI задач:
- API запросы к провайдерам
- Выполнение инструментов (файлы, терминал, браузер)
- Стриминг ответов
- Управление контекстом

### 5. API Handlers (`src/core/api/`)
Провайдеры AI моделей (40+):
- Anthropic (Claude)
- OpenAI (GPT-4o, o1, o3, GPT-5)
- Google (Gemini 2.5/3)
- OpenRouter (агрегатор 200+ моделей)
- AWS Bedrock
- Ollama / LM Studio
- LiteLLM
- И другие OpenAI-совместимые API

### 6. McpHub (`src/services/mcp/McpHub.ts`)
Менеджер MCP серверов:
- Подключение к внешним MCP серверам
- Управление инструментами и ресурсами
- Auto-approval настройки

### 7. Security subsystem

- **`src/core/permissions/`** — CommandPermissionController + CommandSafetyClassifier (whitelist safe/unsafe для shell-команд).
- **`src/services/browser/urlSafety.ts`** — SSRF-guard (`assertSafeUrl`). Интегрирован в `UrlContentFetcher` и `WebFetchToolHandler`. Отклоняет не-http(s), private/loopback/link-local/CGNAT IP, cloud metadata, `localhost`/`*.local`/`*.internal`.
- **Workspace containment** — `openFileRelativePath` проверяет `path.resolve` против `workspaceFolders`; `downloadSkycodeChromium` защищает распаковку Chromium от Zip Slip.
- **Webview channel hardening** — `VscodeWebviewProvider.executeVsCodeCommand` доступна только в `ExtensionMode.Development`; `updateIndexingConfig` работает через allowlist ключей.

Подробности — в корневом `SECURITY.md` и `CHANGELOG.md` (на уровне монорепы).

## Потоки данных

### Выполнение задачи

```
User Input → Controller.initTask()
                    ↓
            Task.initiateTaskLoop()
                    ↓
            attemptApiRequest() → API Provider
                    ↓
            Stream Response → parseAssistantMessage()
                    ↓
            Tool Execution → presentAssistantMessage()
                    ↓
            Tool Result → Continue Loop or Complete
```

### Синхронизация состояния

```
Extension State Change
        ↓
Controller.postStateToWebview()
        ↓
gRPC Message → Webview
        ↓
ExtensionStateContext.setState()
        ↓
React Components Re-render
```

## Хранение данных

| Тип | Хранилище | Назначение |
|-----|-----------|------------|
| API ключи | VS Code Secrets | Безопасное хранение |
| Настройки | GlobalState | Персистентные настройки |
| История задач | Файловая система | JSON файлы по taskId |
| Checkpoints | Git (отключено) | Legacy Cline shadow-git, заменён DiffSystem V4 |

## Режимы работы

### Act Mode (default)
- Выполнение плана
- Редактирование файлов
- Выполнение команд
- Все инструменты доступны

### Plan Mode
- Сбор информации
- Уточняющие вопросы
- Планирование действий
- Инструмент: `plan_mode_respond`

### Debug Mode
- Систематическая отладка с runtime evidence
- Read-only + execute_command

### Ask Mode
- Read-only, исследование кода
- Ответы на вопросы без модификации файлов

## Chat UI

Chat UI использует **TurnBlock** архитектуру:
- Сообщения группируются в turns (user message + AI responses)
- Sticky headers — сообщение пользователя прилипает к верху при скролле (CSS `position: sticky`)
- Collapsed/expanded view для длинных сообщений
- Edit & Resend — редактирование и переотправка сообщений пользователя
- Virtuoso для виртуализированного рендеринга

## См. также

- [CORE.md](./CORE.md) — Детали core модуля
- [PROMPTS.md](./PROMPTS.md) — Система промптов
- [CONTEXT_MANAGEMENT.md](./CONTEXT_MANAGEMENT.md) — Управление контекстом
- [../DIFF_SYSTEM.md](../DIFF_SYSTEM.md) — Diff-система v4
- [../INDEXING_SYSTEM.md](../INDEXING_SYSTEM.md) — Индексация
- [../VSCODE_FORK_PATCHES.md](../VSCODE_FORK_PATCHES.md) — патчи ядра VS Code
- [../development/TOOLS.md](../development/TOOLS.md) — Добавление инструментов
- [../../../../../SECURITY.md](../../../../../SECURITY.md) — Политика безопасности (корень монорепы)
