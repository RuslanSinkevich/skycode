# Chat Pipeline Architecture

Исходный архитектурный план (chat pipeline); статус реализации — в конце страницы.

## Проблема (исходная)

Архитектура до рефакторинга:

- `task.ask()` блокирует через `pWaitFor` (поллит переменную каждые 100мс)
- Один `controller.task` -- одна задача одновременно
- `cancelTask` = уничтожить + пересоздать из истории
- `postStateToWebview()` сливает весь state (все сообщения) при каждом изменении
- Фронтенд угадывает статус AI по типам сообщений (эвристика `isAiWorking`)
- `buttonConfig.ts` выводит кнопки из типа последнего сообщения -- хрупкий автомат

## Целевая архитектура

```mermaid
graph TB
    subgraph frontend ["Фронтенд - Webview"]
        UI[ChatView]
        useSession["хук useSession"]
        ApprovalUI[ApprovalBar]
        ProgressUI[PipelineProgress]
        Input[InputSection]
    end

    subgraph backend ["Бэкенд - Extension Host"]
        SM[SessionManager]
        S1[Session]
        P1[Pipeline]
        AG[ApprovalGate]
        AL[AgentLoop]
    end

    subgraph transport ["Транспорт - ProtoBus"]
        SS["SessionService gRPC stream"]
    end

    Input -->|"inject(msg)"| SS
    ApprovalUI -->|"approve(id)"| SS
    SS -->|"события"| useSession
    useSession --> UI
    useSession --> ApprovalUI
    useSession --> ProgressUI

    SM --> S1
    S1 --> P1
    P1 --> AL
    AL -->|"вызов инструмента"| AG
    AG -->|"авто-апрув?"| AL
    AG -->|"нужен юзер"| SS
```

## Основные абстракции

### 1. Session (заменяет Task)

Одна единица разговора. Независимый state. Готова для табов с первого дня.

```typescript
class Session extends EventEmitter<SessionEvent> {
  id: string
  state: "idle" | "running" | "paused" | "done" | "error"
  messages: SkycodeMessage[]
  pipeline: Pipeline
  approvalGate: ApprovalGate

  inject(msg: UserMessage): void
  abort(): void
  pause(): void
  resume(): void
}
```

Ключевое отличие от Task: `inject()` никогда не блокирует, не падает, не требует маршрутизации. Если pipeline работает -- сообщение в очередь сессии. Если idle -- запускается новая итерация pipeline.

### 2. Pipeline (заменяет agent loop в task/index.ts)

Типизированные шаги исполнения с прогрессом:

```typescript
type PipelineStage =
  | "preparing"
  | "calling_api"
  | "streaming"
  | "tool_execution"
  | "awaiting_approval"
  | "completed"

class Pipeline {
  stages: PipelineStage[]
  currentStage: PipelineStage
  progress: number

  async run(context: PipelineContext): AsyncGenerator<PipelineEvent>
}
```

### 3. ApprovalGate (заменяет pWaitFor + askResponse)

На Promise, без поллинга:

```typescript
class ApprovalGate {
  private pending: Map<string, PromiseResolver<ApprovalResult>>
  private rules: AutoApproveRules

  async check(tool: ToolRequest): Promise<ApprovalResult> {
    if (this.rules.shouldAutoApprove(tool)) {
      return { approved: true }
    }

    const id = generateId()
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.session.emit("approval_needed", { id, tool })
    })
  }

  resolve(id: string, approved: boolean, feedback?: string): void {
    const resolver = this.pending.get(id)
    if (resolver) {
      this.pending.delete(id)
      resolver({ approved, feedback })
    }
  }
}
```

### 4. SessionManager (заменяет controller.task)

```typescript
class SessionManager {
  sessions: Map<string, Session>
  activeSessionId: string | null

  create(): Session
  get(id: string): Session
  switchTo(id: string): void
  get currentSession(): Session | null
}
```

Сессий может быть несколько (вкладки в панели), по одной задаче на сессию.

## Изменения транспорта

### Новый proto: `session.proto`

```proto
service SessionService {
  rpc createSession(CreateSessionRequest) returns (SessionInfo);
  rpc sendMessage(SendMessageRequest) returns (Empty);
  rpc respondToApproval(ApprovalResponse) returns (Empty);
  rpc abortSession(StringRequest) returns (Empty);
  rpc pauseSession(StringRequest) returns (Empty);
  rpc resumeSession(StringRequest) returns (Empty);
  rpc subscribeToSession(StringRequest) returns (stream SessionEvent);
}
```

Ключевое изменение: вместо дампа всего `ExtensionState.skycodeMessages[]` на каждый `postStateToWebview()`, использовать инкрементальные `SessionEvent`.

## Что удаляется из старого контура

- `task.ask()` + `pWaitFor`
- `handleWebviewAskResponse()` и `taskState.askResponse`
- старый `TaskServiceClient.askResponse()`
- `postStateToWebview()` для доставки сообщений
- эвристика `isAiWorking` и `buttonConfig.ts`
- `useMessageQueue` и сложная маршрутизация отправки

## Изменения фронтенда

### Новый хук: `useSession`

- подписка на `SessionService.subscribeToSession`
- хранение `state`, `messages`, `progress`, `approvals`
- методы `inject`, `approve`, `reject`, `abort`, `pause`, `resume`

### Упрощение ChatView

- `InputSection` всегда вызывает `inject()`
- approval UI строится из `pending approvals`
- прогресс рендерится из событий pipeline
- удаляются `useMessageQueue.ts` и `buttonConfig.ts`

## Порядок реализации

| # | Задача | Статус |
|---|--------|--------|
| 1 | Session + SessionManager | Реализовано. Контроллер держит сессии, по одной задаче на сессию; на этом построены вкладки (`src/core/session/tabs.ts`) |
| 2 | ApprovalGate вместо `pWaitFor` для ask/response | Реализовано (`Task.approvalGate`) |
| 3 | Pipeline + события прогресса | Реализовано |
| 4 | `SessionEvent` stream (`proto/skycode/session.proto`) | Реализовано |
| 5 | Frontend (`useSession`, `ApprovalBar`) | Частично: используются в `ChatView`, но `useMessageQueue.ts` и `buttonConfig.ts` ещё живы |
| 6 | Уборка legacy-кода | Частично: `pWaitFor` для ask/response убран, но остаётся в `Task` для других ожиданий (MCP, `userMessageContentReady`) |

> **Примечание:** `Session` пока адаптер над `Task`; `Task` продолжает владеть agent loop, а состояние в webview по-прежнему идёт через `postStateToWebview()` вместе с событиями сессии. Одновременно стримят ответ не больше 3 задач (`ApiSlotLimiter`), остальные ждут слот. Вкладки: [plans/TABS.md](../plans/TABS.md).
