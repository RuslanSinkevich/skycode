> **English version:** [adding-tools.md](../en/development/adding-tools.md)

# Добавление инструментов агента

Инструмент — действие, которое может выполнить агент: прочитать файл, запустить команду, найти код. Пути относительно `extensions/skycode/src/`.

## Что нужно

1. Идентификатор инструмента.
2. Описание для промпта (имя, описание, параметры).
3. Подключение описания к вариантам системного промпта.
4. Обработчик.
5. Регистрация обработчика.
6. Имена параметров в разборе ответа модели.

## Шаги

### 1. Идентификатор

```typescript
// shared/tools.ts
export enum SkycodeDefaultTool {
  MY_TOOL = "my_tool",
}
```

### 2. Описание

Создайте `core/prompts/system-prompt/tools/my_tool.ts`.

```typescript
import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"
import { TASK_PROGRESS_PARAMETER } from "../types"

const id = SkycodeDefaultTool.MY_TOOL

const generic: SkycodeToolSpec = {
  variant: ModelFamily.GENERIC,
  id,
  name: "my_tool",
  description: "Делает X, когда нужно Y",
  parameters: [
    {
      name: "input",
      required: true,
      instruction: "Для чего нужен этот параметр",
      usage: "example_value",
    },
    TASK_PROGRESS_PARAMETER,
  ],
  // contextRequirements: (ctx) => ctx.someCondition,   // необязательно
}

export const my_tool_variants = [generic]
```

Если для семейства модели нет своего варианта, берётся вариант `GENERIC`. Отдельные варианты нужны, когда описание должно отличаться (например, для нативных вызовов `NATIVE_GPT_5`, `NATIVE_NEXT_GEN`).

### 3. Экспорт и регистрация описания

```typescript
// core/prompts/system-prompt/tools/index.ts
export * from "./my_tool"

// core/prompts/system-prompt/tools/init.ts
import { my_tool_variants } from "./my_tool"
// ...и добавить ...my_tool_variants в массив allToolVariants в registerSkycodeToolSets()
```

### 4. Подключение к вариантам промпта

В `core/prompts/system-prompt/variants/<вариант>/config.ts` добавьте инструмент в список `.tools(...)` каждого варианта, где он должен быть доступен:

```typescript
.tools(
  SkycodeDefaultTool.FILE_READ,
  SkycodeDefaultTool.MY_TOOL,
)
```

Варианты лежат в `variants/` (generic, qwen, xs, next-gen, native-next-gen, gpt-5 и другие). После изменения промптов обновите снапшоты: `UPDATE_SNAPSHOTS=true npm run test:unit`.

### 5. Обработчик

```typescript
// core/task/tools/handlers/MyToolHandler.ts
export class MyToolHandler implements IFullyManagedTool {
  readonly name = SkycodeDefaultTool.MY_TOOL

  getDescription(block: ToolUse): string {
    return `[${block.name} for '${block.params.input}']`
  }

  async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
    // показать частично полученный вызов в чате (необязательно содержательно)
  }

  async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
    const input = block.params.input
    return await doSomething(input)
  }
}
```

Интерфейсы (`core/task/tools/ToolExecutorCoordinator.ts`):

- `IToolHandler`: `name`, `execute`, `getDescription`;
- `IPartialBlockHandler`: `handlePartialBlock` для показа вызова во время потока;
- `IFullyManagedTool` объединяет оба. Обработчик сам отвечает за запрос подтверждения и сообщения в чате.

Один обработчик может обслуживать несколько имён через `SharedToolHandler` (так сделаны `replace_in_file`, `replace_text` и `delete_block` поверх `WriteToFileToolHandler`).

### 6. Регистрация обработчика

```typescript
// core/task/ToolExecutor.ts, registerToolHandlers()
this.coordinator.register(new MyToolHandler())
```

### 7. Имена параметров

Добавьте новые имена параметров в `toolParamNames` в `core/assistant-message/index.ts`, чтобы разбор потока их распознал.

## Подтверждение действия

Для действий с побочными эффектами спрашивайте пользователя, если автоподтверждение не включено:

```typescript
const autoApproved = config.callbacks.shouldAutoApproveTool(SkycodeDefaultTool.MY_TOOL)
if (!autoApproved) {
  const didApprove = await ToolResultUtils.askApprovalAndPushFeedback("tool", message, config)
  if (!didApprove) {
    return formatResponse.toolDenied()
  }
}
```

Правила автоподтверждения лежат в `core/task/tools/autoApprove.ts`. Новый инструмент нужно добавить и туда, иначе он будет считаться требующим подтверждения. Ограничения по режимам (Вопрос, Чат, План, облегчённый режим) заданы списками в `core/task/ToolExecutor.ts`. Если инструмент пишет в файлы, он должен идти через `DiffSystem`, как `WriteToFileToolHandler`.

## Существующие инструменты

Описания лежат в `core/prompts/system-prompt/tools/`, обработчики в `core/task/tools/handlers/`.

| Группа | Инструменты |
|---|---|
| Файлы | `read_file`, `read_symbol`, `write_to_file`, `replace_in_file`, `replace_text`, `delete_block`, `apply_patch`, `edit_notebook` |
| Поиск | `codebase_search`, `search_files`, `glob`, `list_files`, `list_code_definition_names`, `read_diagnostics` |
| Команды | `execute_command`, `check_background_command` |
| Веб и браузер | `web_search`, `web_fetch`, `browser_action` |
| MCP | `use_mcp_tool`, `access_mcp_resource`, `load_mcp_documentation` |
| Вывод в чат | `show_chart`, `show_visual`, `generate_explanation` |
| Управление ходом | `ask_followup_question`, `attempt_completion`, `plan_mode_respond`, `act_mode_respond`, `new_task`, `focus_chain`, `use_skill` |
| Контекст | `condense`, `summarize_task` |
