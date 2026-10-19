# Общие правила разработки

Важные паттерны и подводные камни при разработке Skycode AI.

## Сборка

Команды выполняются в `extensions/skycode`:

- Зависимости: `npm ci` и `cd webview-ui && npm ci`
- Генерация proto: `npm run protos`
- Проверка типов: `npx tsc --noEmit -p .`, `npx tsc --noEmit -p tsconfig.test.json`, webview: `cd webview-ui && npx tsc --noEmit -p tsconfig.app.json`
- Линт: `npx biome lint --diagnostic-level=error src webview-ui/src`
- Юнит-тесты: `npm run test:unit` (mocha); webview: `cd webview-ui && npx vitest run`
- Быстрая сборка: `node esbuild.mjs`; полная: `npm run package`

Подробнее — [../BUILD.md](../BUILD.md).

## gRPC/Protobuf коммуникация

Extension и webview общаются через gRPC-подобный протокол.

### Proto файлы

Расположение: `proto/skycode/*.proto`

```protobuf
// Именование
service MyService { }      // PascalCase
rpc myMethod() { }         // camelCase
message MyMessage { }      // PascalCase
```

### После изменения proto

```bash
npm run protos
```

Генерирует (папки в `.gitignore`, в репозиторий не попадают):
- `src/shared/proto/`
- `src/generated/hosts/`
- `webview-ui/src/services/grpc-client.ts`

### Правила для `.proto`

- Номера полей не переиспользовать и не менять. Удалённое поле заменять на `reserved N;`.
- `scripts/generate-state-proto.mjs` не запускать.

### Добавление нового RPC метода

1. Добавить в `.proto` файл
2. Создать хэндлер в `src/core/controller/<domain>/`
3. Вызвать из webview: `UiServiceClient.myMethod(request)`

## GlobalState

### Добавление нового ключа

1. **Добавить поле** в `GLOBAL_STATE_FIELDS` в `src/shared/storage/state-keys.ts`:
   ```typescript
   const GLOBAL_STATE_FIELDS = {
     // ... существующие
     myKey: { default: undefined as string | undefined },
   } satisfies FieldDefinitions
   ```
   > `GlobalState` — это `type`, автоматически выведенный из `GLOBAL_STATE_FIELDS`. Интерфейс не нужно редактировать вручную.

2. **Чтение** в `src/core/storage/utils/state-helpers.ts` (если нужно в `getStateToPostToWebview`):
   ```typescript
   myKey: stateManager.getGlobalStateKey("myKey"),
   ```

3. **Использование**:
   ```typescript
   controller.stateManager.setGlobalState("myKey", value)
   controller.stateManager.getGlobalStateKey("myKey")
   ```

### Кэш StateManager

StateManager использует in-memory кэш, заполняемый при инициализации.

**Исключение**: Состояние, нужное сразу при запуске (до готовности кэша) — читать напрямую:

```typescript
// При старте в common.ts
const value = context.globalState.get<string>("myKey")

// После инициализации — через StateManager
controller.stateManager.getGlobalStateKey("myKey")
```

## Добавление API провайдера

Три места для proto конверсии (иначе сбросится на Anthropic):

1. `proto/skycode/models.proto` — добавить в enum `ApiProvider`
2. `convertApiProviderToProto()` в `src/shared/proto-conversions/models/api-configuration-conversion.ts`
3. `convertProtoToApiProvider()` там же

Дополнительно:
- `src/shared/api.ts` — union type и модели
- `src/shared/providers/providers.json` — для dropdown
- `src/core/api/index.ts` — хэндлер в `createHandlerForProvider()`
- Webview компоненты

## Инструменты в системном промпте

**Всегда ищите похожие инструменты и следуйте их паттерну!**

1. Добавить в `SkycodeDefaultTool` enum
2. Создать файл в `src/core/prompts/system-prompt/tools/`
3. Зарегистрировать в `tools/init.ts`
4. Добавить в конфиги вариантов (`variants/*/config.ts`)
5. Создать хэндлер
6. Подключить в `ToolExecutor.ts`

## Slash-команды

Три места:
- `src/core/slash-commands/index.ts` — определения
- `src/core/prompts/commands.ts` — интеграция в промпт
- `webview-ui/src/utils/slash-commands.ts` — автодополнение

## ChatRow состояния

При отмене задачи статус не обновляется автоматически. Проверяйте:

```typescript
const wasCancelled =
  status === "generating" &&
  (!isLast ||
    lastModifiedMessage?.ask === "resume_task" ||
    lastModifiedMessage?.ask === "resume_completed_task")
```

## Регенерация снапшотов

После изменения промптов:

```bash
UPDATE_SNAPSHOTS=true npm run test:unit
```

## См. также

- [NETWORK.md](./NETWORK.md) — сетевые запросы
- [TOOLS.md](./TOOLS.md) — добавление инструментов
- [../ADDING_SETTINGS.md](../ADDING_SETTINGS.md) — добавление настроек
- [../BUILD.md](../BUILD.md) — сборка и релиз
