# Core модуль

Точка входа расширения: `extension.ts` → controller → task

## Структура

```
src/core/
├── controller/    # gRPC обработчики, управление задачами
├── task/          # AI задачи: API запросы + выполнение инструментов
├── diff-v2/       # Inline Diff System V4 (snapshot-based)
├── session/       # ApprovalGate, Pipeline, SessionManager, ApiSlotLimiter, tabs (вкладки)
├── indexing/      # Векторный индекс (необязателен; основной поиск — services/repo-map)
├── prompts/       # Система промптов (TemplateEngine + PromptBuilder)
├── api/           # API провайдеры (OpenAI, Anthropic, Gemini, ...)
├── workspace/     # Multi-root workspace resolver
├── context/       # Context management (файлы, правила, focus chain)
├── workflow/      # Многошаговый YAML workflow engine (WorkflowOrchestrator)
├── storage/       # StateManager, чтение/запись состояния на диске
├── inline-edit/   # Ctrl+Shift+K — правка выделения без чата
├── hooks/         # Lifecycle hooks (TaskStart, TaskComplete, ...)
├── ignore/        # .skycodeignore controller
├── mentions/      # @-упоминания в чате
├── slash-commands/# Парсинг slash-команд
├── commands/      # Реализация VS Code команд
└── permissions/   # Контроль доступа: CommandPermissionController + CommandSafetyClassifier
```

## Ключевые подсистемы

### Task lifecycle
```
Controller.initTask()
    → new Task(taskId, ...)
    → Task.startTask() / resumeTaskFromHistory()
        → diffSystem.startCheckpoint(messageTs)
        → recursivelyMakeSkycodeRequests() — main AI loop
            → attemptApiRequest() — stream chunks
            → parseAssistantMessageV2()
            → ToolExecutor — write_to_file, replace_text, execute_command, etc.
            → ask("completion_result") — wait for user
        → User feedback → startCheckpoint(feedbackTs) — new RG
```

### DiffSystem V4 (`src/core/diff-v2/`)
Cursor-like inline diffs с per-message snapshots. См. [DIFF_SYSTEM.md](../DIFF_SYSTEM.md).

> **Старые чекпоинты Cline удалены (октябрь 2026).** Shadow-git чекпоинты (теневой git-репозиторий
> на каждую задачу) были выключены с 2026-02-25 и заменены DiffSystem V2 (snapshot-based, без git);
> в октябре 2026 удалены вместе с RPC `CheckpointsService`, `taskCompletionViewChanges`, `explainChanges`.
> В старых историях остаются сообщения `checkpoint_created` и поле `shadowGitConfigWorkTree` —
> чат и история их по-прежнему понимают.

```
DiffSystem (facade)
├── DiffStore — ResponseGroups, FileChanges, Hunks (workspaceState)
├── FileSnapshotStorage — per-message file snapshots (disk)
├── HunkApplier — applies changes, reads actual file for removedLines
├── HunkReverter — reject/accept with \n EOL, parent status cascade
├── PositionTracker — recalculates positions after edits
├── SystemEditGuard — distinguishes system edits from manual
├── HunkDecorations — стандартные декорации редактора (зелёный фон, красная черта, hover)
└── KeyboardNavigation — cross-file hunk navigation
```

### ApprovalGate (`src/core/session/ApprovalGate.ts`)
Promise-based ask/response замена pWaitFor. Early response queue решает race condition при resend.

### Controller (`src/core/controller/index.ts`)
- `initTask()` → создание задачи и сессии (`sessionManager.create`), DiffSystem.setCurrentTaskId
- `cancelTask()` → abort + re-init from history
- `clearTask()` → cleanup текущей задачи/сессии
- `deleteFromMessage()` → rollbackFromMessage + truncate history (`controller/task/`)
- `retryFromMessage()` / `resendFromMessage()` → rollback + truncate + auto-resend
- вкладки: `newTab`, `switchTab`, `closeTab`, `openTaskInTab` (`controller/task/`)

### ToolExecutor (`src/core/task/ToolExecutor.ts`)
- Lightweight mode restrictions (`LIGHTWEIGHT_MODE_RESTRICTED_TOOLS`: execute_command, редактирование, apply_patch, удаление файлов)
- Ограничения по режимам: Ask и Chat не могут менять файлы и запускать команды
- Обработчики инструментов регистрируются в `registerToolHandlers()`, сами хэндлеры — `src/core/task/tools/handlers/`
- EditNotebook (edit_notebook) — Jupyter .ipynb cell editing (insert/replace)

### Inline Edit (`src/core/inline-edit/InlineEditController.ts`)
Команда `skycode.inlineEdit` (`Ctrl+Shift+K` / `Cmd+Shift+K`). Доступна при непустом выделении:

- Собирает `system + user` prompt (file path, язык, before/after context, выделение, инструкция).
- Стримит ответ из текущего `ApiHandler`, накапливая текст.
- Прокидывает результат через `DiffSystem.replaceLines()` — изменение появляется как обычный inline diff (Accept/Reject).
- Независима от панели чата.

### Workflow (`src/core/workflow/`)
`WorkflowOrchestrator` выполняет многошаговые YAML-сценарии поверх стандартного agent loop:

- Каждый включённый шаг инжектит step-prompt как user-message и вызывает `Task.initiateStepLoop()`.
- История разговора общая для всех шагов — поздние шаги видят, что делал агент раньше.
- `WorkflowParser` валидирует YAML; редактор — `WorkflowEditor` в окне правил и workflows.
- Между шагами проверяется `task.isAborted()` — пользователь может отменить выполнение.

### Permissions (`src/core/permissions/`)
Контроль доступа к действиям агента.

- **CommandPermissionController** — env-based разрешения для команд
- **CommandSafetyClassifier** — классификация shell-команд на safe/unsafe (whitelist-подход):
  - safe = read-only (ls, cat, git status, npm test, grep, find, ...)
  - unsafe = всё остальное (rm, npm install, git push, curl, sudo, ...)
  - Pipe/chain: ВСЕ сегменты должны быть safe
  - Redirect (>, >>) = всегда unsafe

### URL safety (`src/services/browser/urlSafety.ts`)
Защита от SSRF перед любыми исходящими HTTP-запросами, инициированными инструментами.

`assertSafeUrl(rawUrl, opts?)`:
- Принимает только `http` / `https` (настраивается).
- Отклоняет URL с credentials (`user:pass@host`).
- Отклоняет loopback / link-local / private / CGNAT / multicast IPv4 и IPv6.
- Отклоняет cloud metadata (AWS/GCP/Azure `169.254.169.254`, `metadata.google.internal`).
- Отклоняет `localhost`, `*.local`, `*.internal` и схожие hostnames.

Интегрирован в:
- `UrlContentFetcher.urlToMarkdown()` — перед `page.goto()`.
- `WebFetchToolHandler.execute()` — ранний отказ до запуска Puppeteer.

В случае отказа возвращает `UnsafeUrlError` — сообщение видно модели.

### Workspace containment и Zip Slip

- `core/controller/file/openFileRelativePath` — `path.resolve()` + сверка с `vscode.workspace.workspaceFolders`. Открытие файла вне workspace отклоняется и логируется.
- `services/browser/utils.downloadSkycodeChromium` — перед `zip.extractAllTo()` каждая запись архива проверяется на абсолютные пути и containment в корне распаковки.

### AutoApprove (`src/core/task/tools/autoApprove.ts`)
Решает, нужно ли спрашивать пользователя перед выполнением инструмента.

Настройки в `AutoApprovalSettings.actions`:
| Настройка | Тип | Default | Описание |
|---|---|---|---|
| `readFiles` | boolean | true | Чтение файлов |
| `editFiles` | boolean | true | Редактирование файлов |
| `executeSafeCommands` | boolean | true | Безопасные команды |
| `executeAllCommands` | boolean | false | Все команды |
| `deleteFiles` | boolean | false | Удаление файлов |
| `editNotebooks` | boolean | false | Jupyter блокноты |
| `useBrowser` | boolean | true | Браузер |
| `useMcp` | boolean | true | MCP серверы |

YOLO Mode → всё auto-approve, без вопросов.

## Состояние

### GlobalState (persists across sessions)
```typescript
interface GlobalState {
  apiProvider?: string
  // ... настройки
}
```

### Secrets (secure storage)
```typescript
context.secrets.store("apiKey", value)
context.secrets.get("apiKey")
```

### Task State (per task, filesystem)
```
<globalStorage>/tasks/{taskId}/
├── api_conversation_history.json
└── skycode_messages.json
```

### DiffStore (per workspace, workspaceState)
```
skycode.diff.v3.responseGroups  — ResponseGroup[]
skycode.diff.v3.fileChanges     — FileChangeRecord[]
skycode.diff.v3.hunks           — Hunk[]
```

### Snapshots (per workspace, globalStorage)
```
globalStorage/snapshots/{responseGroupId}/{fsPathHash}.snapshot
```

### Index State (per workspace)
```
~/.skycode/indexing/{workspace-hash}/index.db (SQLite)
```

---


