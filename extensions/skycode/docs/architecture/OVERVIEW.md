# Архитектура Skycode AI

## Обзор

Skycode AI — это расширение VS Code (`skycode.skycode-ai`, работает в обычном VS Code 1.90+, не форк), состоящее из трёх основных частей:
- **Core Extension** (бэкенд на Node.js)
- **Webview UI** (фронтенд на React)
- **Code Search** (карта репозитория + ripgrep) и необязательный **Indexing Subsystem** (векторный индекс)

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
- Подключение dev-сервера webview в режиме разработки

### 3. Controller (`src/core/controller/index.ts`)
Центральный координатор:
- Управление состоянием (GlobalState, Secrets)
- Создание и управление задачами (Task) и сессиями-вкладками (`SessionManager`, `src/core/session/`)
- Координация MCP серверов
- Синхронизация состояния с webview

### 4. Task (`src/core/task/index.ts`)
Выполнение AI задач:
- API запросы к провайдерам
- Выполнение инструментов (файлы, терминал, браузер)
- Стриминг ответов
- Управление контекстом

### 5. API Handlers (`src/core/api/`)
Провайдеры AI моделей (17, список — `src/shared/providers/providers.json`, по умолчанию OpenAI Compatible):
- OpenAI Compatible — любой совместимый эндпоинт (vLLM и др.), Ollama, LM Studio, LiteLLM
- GigaChat, YandexGPT, DeepSeek, Alibaba Qwen, Qwen Code, Qwen Web
- OpenRouter, Anthropic, OpenAI, Gemini
- VS Code LM, Claude Code, OpenAI Codex

### 6. McpHub (`src/services/mcp/McpHub.ts`)
Менеджер MCP серверов:
- Подключение к внешним MCP серверам
- Управление инструментами и ресурсами
- Auto-approval настройки

### 7. Inline Edit (`src/core/inline-edit/InlineEditController.ts`)
Команда `Ctrl+Shift+K` (`Cmd+Shift+K`) для правки выделения без чата:
- Собирается компактный prompt (file path, language, before/after context, selected code, instruction)
- Результат стрима из текущего `ApiHandler` применяется через `DiffSystem.replaceLines()` и попадает в общий список правок (подсветка в редакторе, панель изменений в чате)
- Не зависит от панели чата

### 8. Workflow Orchestrator (`src/core/workflow/`)
Последовательное выполнение YAML-сценариев поверх стандартного agent loop:
- Каждый включённый шаг инжектит свой prompt как user-message и вызывает `Task.initiateStepLoop()`
- История разговора шарится между шагами
- `WorkflowParser` проверяет схему YAML; редактор — `WorkflowEditor` в окне правил и workflows
- Отмена между шагами по `task.isAborted()`

### 9. Security subsystem

- **`src/core/permissions/`** — CommandPermissionController + CommandSafetyClassifier (whitelist safe/unsafe для shell-команд).
- **`src/services/browser/urlSafety.ts`** — SSRF-guard (`assertSafeUrl`). Интегрирован в `UrlContentFetcher` и `WebFetchToolHandler`. Отклоняет не-http(s), private/loopback/link-local/CGNAT IP, cloud metadata, `localhost`/`*.local`/`*.internal`.
- **Workspace containment** — `openFileRelativePath` проверяет `path.resolve` против `workspaceFolders`; `downloadSkycodeChromium` защищает распаковку Chromium от Zip Slip.
- **Webview channel hardening** — `VscodeWebviewProvider.executeVsCodeCommand` доступна только в `ExtensionMode.Development`; `updateIndexingConfig` работает через allowlist ключей.


### 10. Голосовой ввод (`src/services/dictation/`)
Диктовка в поле чата. Для русского по умолчанию работает GigaAM v3 на sherpa-onnx: текст появляется во время речи, офлайн. Для остальных языков — локальный whisper.cpp (`WhisperLocalService`). Подробности GigaAM — [../VOICE_INPUT.md](../VOICE_INPUT.md).

## Потоки данных

### Выполнение задачи

```
User Input → Controller.initTask()
                    ↓
            Task.initiateTaskLoop() → recursivelyMakeSkycodeRequests()
                    ↓
            attemptApiRequest() → API Provider
                    ↓
            Stream Response → parseAssistantMessageV2()
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
- Полный доступ к инструментам, как в Act (в `getApiSettingsMode` режим Debug использует настройки модели Act)

### Ask Mode
- Read-only, исследование кода
- Ответы на вопросы без модификации файлов

### Chat Mode
- Диалог без проактивного исследования проекта
- Инструменты, меняющие файлы и запускающие команды, недоступны (`ToolExecutor.CHAT_MODE_RESTRICTED_TOOLS`)

Режим хранится отдельно для каждой вкладки.

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
- [../DIFF_SYSTEM.md](../DIFF_SYSTEM.md) — система diff
- [../VOICE_INPUT.md](../VOICE_INPUT.md) — голосовой ввод
- [../INDEXING_SYSTEM.md](../INDEXING_SYSTEM.md) — Индексация
- [../development/TOOLS.md](../development/TOOLS.md) — Добавление инструментов
