> **English version:** [core.md](../en/architecture/core.md)

# Модуль Core

Путь запроса: `extension.ts` → `Controller` → `Task`. Все пути ниже относительно `extensions/skycode/src/`.

## Структура `core/`

```
core/
├── api/             # Провайдеры моделей, повторные попытки, преобразование сообщений
├── assistant-message/ # Разбор потока ответа модели (текст и вызовы инструментов)
├── context/         # Управление контекстом, журнал сессии, правила и инструкции
├── controller/      # Controller и обработчики запросов webview (по доменам)
├── diff-v2/         # Просмотр изменений: хранилище, движок, декорации
├── hooks/           # Хуки жизненного цикла (не работают на Windows)
├── ignore/          # .skycodeignore
├── indexing/        # Необязательный векторный индекс
├── inline-edit/     # Правка выделенного кода по Ctrl+Shift+K
├── mentions/        # @-упоминания в чате
├── permissions/     # Классификатор команд и разрешения
├── prompts/         # Системный промпт и ответы инструментов
├── session/         # SessionManager, вкладки, ApprovalGate, ApiSlotLimiter
├── slash-commands/  # Слэш-команды
├── storage/         # StateManager, пути на диске
├── task/            # Task, ToolExecutor, обработчики инструментов
├── webview/         # WebviewProvider
├── workflow/        # Многошаговые рабочие процессы
└── workspace/       # Несколько корней рабочей области
```

## Задача (Task)

`Controller.initTask()` создаёт `Task`. `Task.startTask()` или `Task.resumeTaskFromHistory()` запускает цикл:

```
initiateTaskLoop()
  → recursivelyMakeSkycodeRequests()
      → attemptApiRequest()       # потоковый запрос к модели
      → разбор потока             # текст, рассуждения, вызовы инструментов
      → ToolExecutor              # выполнение инструментов
      → следующий запрос или ask("completion_result")
```

Перед первой правкой каждого сообщения пользователя вызывается `DiffSystem.startCheckpoint(...)`. Так формируется группа изменений, к которой привязан снимок для отката.

### Защиты при разборе потока

- **Зацикливание** (`task/repetitionLoop.ts`). Детектор получает текст ответа и рассуждения. Содержимое вызовов инструментов он не проверяет, чтобы не срабатывать на повторяющемся коде. Если один фрагмент повторяется много раз или короткий узор тянется очень долго, ответ прерывается, модель получает заметку.
- **Оборванный вызов** (`task/truncatedToolCall.ts`). Если ответ обрезан внутри вызова `write_to_file`, `replace_in_file`, `apply_patch`, `edit_notebook`, `delete_block`, `replace_text`, `execute_command` и подобных, вызов не выполняется. Модель получает просьбу разбить работу на части.
- **Повтор вызова.** Точный повтор того же вызова инструмента сопровождается мягкой заметкой (`toolCallSignature.ts`).
- **Счётчик ошибок.** После `maxConsecutiveMistakes` подряд идущих ошибок (по умолчанию 3) агент останавливается и ждёт пользователя.
- **Бюджет вызовов для слабых и средних моделей.** `ToolExecutor` считает вызовы за ход. При 80% лимита модель получает предупреждение, при исчерпании ей велено вызвать `attempt_completion`. Для сильных моделей лимита нет (классы моделей описаны в [Управлении контекстом](./context-management.md)). Лимиты: средний уровень 80 вызовов, слабый 25 (`src/shared/prompts.ts`).

### Параметры выборки Qwen

Для моделей, в имени которых есть `qwen`, `core/api/providers/qwenSampling.ts` задаёт температуру 0,6 (если в настройках 0 или пусто), `top_p` 0,95 и `top_k` 20. Если шлюз отвечает ошибкой 400 на неизвестные поля, эти два параметра больше не отправляются на этот адрес до перезапуска.

## ToolExecutor

`task/ToolExecutor.ts` регистрирует обработчики в `ToolExecutorCoordinator` и проверяет ограничения перед выполнением:

- **Вопрос и Чат:** запись файлов, `apply_patch`, `edit_notebook`, `execute_command`, браузер и MCP заблокированы. Модель получает сообщение об ошибке.
- **План:** при `strictPlanModeEnabled` (по умолчанию включено) инструменты записи заблокированы.
- **Облегчённый режим** (`lightweightMode`, для слабых моделей): запрещены `execute_command`, `replace_in_file`, `apply_patch` и удаление файлов. Вместо них модель использует `replace_text`, `delete_block` и `write_to_file`.

Обработчики лежат в `task/tools/handlers/`. Описания инструментов для промпта лежат в `prompts/system-prompt/tools/`. Как добавить инструмент: [Добавление инструментов](../development/adding-tools.md).

## Разрешения и автоподтверждение

`task/tools/autoApprove.ts` решает, нужно ли спрашивать пользователя. Настройки лежат в `autoApprovalSettings.actions` (вкладка «Разрешения»):

| Настройка | По умолчанию | Смысл |
|---|---|---|
| `readFiles` | включено | Чтение файлов в рабочей папке |
| `readFilesExternally` | выключено | Чтение вне рабочей папки |
| `editFiles` | включено | Правка файлов в рабочей папке |
| `editFilesExternally` | выключено | Правка вне рабочей папки |
| `executeSafeCommands` | включено | Команды из белого списка (чтение) |
| `executeNonDestructiveCommands` | выключено | Всё, кроме заведомо опасного |
| `executeAllCommands` | выключено | Любые команды |
| `deleteFiles` | выключено | Удаление файлов |
| `editNotebooks` | выключено | Jupyter-ноутбуки |
| `useBrowser` | включено | Браузер |
| `useMcp` | включено | MCP, но каждый инструмент MCP подтверждается отдельно, пока для него не включено автоподтверждение |

`permissions/CommandSafetyClassifier.ts` относит команду к одному из классов:

- `safe`: команда из белого списка, только чтение;
- `unsafe`: команда из чёрного списка (`rm`, `sudo`, `ssh`, установка пакетов и т. п.), опасный флаг или перенаправление вывода;
- `unknown`: команда не опознана.

Режим «безопасные команды» одобряет только `safe`. Режим «всё, кроме опасного» одобряет `safe` и `unknown`. В цепочках и пайпах оцениваются все сегменты.

## Сессии и вкладки

`session/SessionManager.ts` хранит сессии. Каждая вкладка в интерфейсе соответствует сессии. Статус вкладки (работает, ждёт подтверждения, завершена, в очереди, остановлена) выводится в `session/tabs.ts` из состояния задачи. `ApiSlotLimiter` пускает к модели не больше трёх запросов одновременно, остальные задачи ждут свободный слот.

`ApprovalGate` — механизм ask/response на промисах. Он заменил опрос по таймеру и хранит очередь ответов, которые пришли раньше, чем задача дошла до ожидания.

## Controller

`controller/index.ts` создаёт и прерывает задачи (`initTask`, `cancelTask`, `clearTask`) и отправляет состояние в webview (`getStateToPostToWebview`). Остальные операции лежат в `controller/task/`: `deleteFromMessage`, `retryFromMessage`, `resendFromMessage`, `interruptAndSend` (прервать поток и сразу обработать сообщение пользователя), `newTab`, `switchTab`, `closeTab`. Удаление и повтор вызывают откат файлов через `DiffSystem`.

## Состояние

`storage/StateManager.ts` держит настройки в памяти и пишет их в `globalState` VS Code. Ключи API идут в SecretStorage. Состояние рабочей области (список непринятых правок) идёт в `workspaceState`. Каждое окно VS Code читает диск один раз при старте.

Файлы задачи лежат в `tasks/<taskId>/` папки данных расширения:

```
api_conversation_history.json   # история для модели
ui_messages.json                # сообщения чата
context_history.json            # правки контекста (заглушки, сжатие)
task_metadata.json
```

Снимки файлов и состояние непринятых правок описаны в [Просмотре изменений](../systems/diff-system.md).

## Хуки

`hooks/` запускает скрипты из `.skycoderules/hooks` на событиях жизненного цикла (`TaskStart`, `TaskComplete`, `PreToolUse`, `PostToolUse`, `PreCompact` и др.). На Windows хуки отключены (`getHooksEnabledSafe`).

## См. также

- [Управление контекстом](./context-management.md)
- [Просмотр изменений](../systems/diff-system.md)
- [Добавление инструментов](../development/adding-tools.md)
