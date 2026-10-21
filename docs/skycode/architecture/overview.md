> **English version:** [overview.md](../en/architecture/overview.md)

# Обзор архитектуры

Skycode AI — расширение VS Code (`skycode.skycode-ai`). Код лежит в `extensions/skycode/`. Расширение состоит из трёх частей:

- **Расширение (Node.js)**: цикл агента, выполнение инструментов, провайдеры моделей, система просмотра изменений, MCP.
- **Webview UI (React)**: чат, настройки, история, вкладки.
- **Индексация**: необязательный векторный индекс. По умолчанию выключен. Без него поиск идёт по карте репозитория и ripgrep.

## Схема

```
┌──────────────────────────────────────────────────────────┐
│ VS Code (extension host)                                 │
│                                                          │
│  extension.ts ──► WebviewProvider ──► Controller         │
│                                          │               │
│            ┌─────────────┬───────────────┼────────────┐  │
│            ▼             ▼               ▼            ▼  │
│     SessionManager   StateManager    McpHub     DiffSystem│
│       (вкладки)      (состояние)                          │
│            │                                             │
│            ▼                                             │
│      Task (агент) ──► API-провайдер ──► модель           │
│            │                                             │
│            └──► ToolExecutor ──► обработчики инструментов│
│                                                          │
│                     ▲ gRPC-сообщения ▼                   │
│  Webview UI (React): чат, настройки, панель изменений    │
└──────────────────────────────────────────────────────────┘
```

## Ключевые компоненты

| Компонент | Файл | Назначение |
|---|---|---|
| Точка входа | `src/extension.ts` | Активация, регистрация команд и сочетаний клавиш |
| WebviewProvider | `src/core/webview/` | Создание webview, HTML с CSP |
| Controller | `src/core/controller/index.ts` | Состояние, создание задач, отправка состояния в webview. Обработчики запросов webview лежат в подпапках `src/core/controller/*` |
| SessionManager | `src/core/session/` | Сессии и вкладки. `ApiSlotLimiter` пускает к модели не больше трёх запросов одновременно |
| Task | `src/core/task/index.ts` | Один запуск агента: запрос к модели, разбор потока, вызов инструментов |
| ToolExecutor | `src/core/task/ToolExecutor.ts` | Регистрация обработчиков инструментов, ограничения по режимам |
| Провайдеры | `src/core/api/providers/` | 17 провайдеров, список в `src/shared/providers/providers.json` |
| Промпты | `src/core/prompts/system-prompt/` | Системный промпт: варианты под семейства моделей, описания инструментов |
| DiffSystem | `src/core/diff-v2/` | Правки агента, снимки, откат. См. [Просмотр изменений](../systems/diff-system.md) |
| McpHub | `src/services/mcp/McpHub.ts` | Подключение MCP-серверов. См. [MCP](../systems/mcp.md) |
| Диктовка | `src/services/dictation/` | Голосовой ввод. См. [Голосовой ввод](../systems/voice-input.md) |
| Индексация | `src/core/indexing/`, `src/services/repo-map/` | Карта репозитория и необязательный векторный индекс |

## Связь расширения и webview

Webview и расширение обмениваются сообщениями в формате gRPC-подобных вызовов. Описания лежат в `proto/skycode/*.proto`, код генерируется командой `npm run protos`. Расширение отправляет в webview состояние (`Controller.postStateToWebview`), webview вызывает методы сервисов (например, `TaskServiceClient`, `UiServiceClient`).

## Выполнение задачи

```
Ввод пользователя → Controller.initTask()
                         ↓
                   Task: запрос к модели (attemptApiRequest)
                         ↓
                   Разбор потока: текст, рассуждения, вызовы инструментов
                         ↓
                   ToolExecutor → обработчик → результат в историю
                         ↓
                   Следующий запрос или завершение
```

Во время разбора потока работают защиты: остановка при зацикливании и отказ выполнять оборванный вызов инструмента. См. [Модуль Core](./core.md).

## Хранение данных

| Что | Где |
|---|---|
| Ключи API | VS Code SecretStorage |
| Настройки | `globalState` VS Code, кэш в памяти (`StateManager`) |
| Состояние рабочей области, список непринятых правок | `workspaceState` |
| Задачи | `tasks/<id>/` в папке данных расширения: `api_conversation_history.json`, `ui_messages.json`, `context_history.json`, `task_metadata.json` |
| Снимки файлов для отката | папка данных расширения, `FileSnapshotStorage` |
| Файл конфигурации MCP | `skycode_mcp_settings.json` в `settings/` папки данных расширения |
| Векторный индекс | `~/.skycode/indexing/<хеш рабочей области>/` |
| Кэш карты репозитория | `~/.skycode/repo-map/<хеш>.json` |
| Голосовые компоненты | `voice-sherpa/` и `whisper/` в папке данных расширения |

Папка данных расширения — это `globalStorage` VS Code для `skycode.skycode-ai`. Миграция с прежнего идентификатора: `src/hosts/vscode/migrateLegacyStorage.ts`.

## Режимы

| Режим | Что делает |
|---|---|
| Акт | Все инструменты, кроме `plan_mode_respond`. Режим по умолчанию |
| Вопрос | Чтение кода, поиск, веб-инструменты. Запись, команды, браузер и MCP блокируются в `ToolExecutor` |
| План | Сбор информации и план через `plan_mode_respond`. При включённой настройке `strictPlanModeEnabled` (по умолчанию включена) инструменты записи заблокированы |
| Дебаг | Системный промпт требует идти от фактов к гипотезам и проверке. Ограничений на инструменты нет |
| Чат | Разговор. Инструменты только по явной просьбе. Запись, команды, браузер и MCP блокируются |

## См. также

- [Модуль Core](./core.md)
- [Управление контекстом](./context-management.md)
- [Просмотр изменений](../systems/diff-system.md)
- [Индексация](../systems/indexing-system.md)
