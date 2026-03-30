> **English version:** [adding-tools.md](../../development/adding-tools.md)

# Добавление инструментов агента

Руководство по добавлению новых инструментов в AI-агент Skycode.

## Обзор

Инструменты — это действия, которые AI-агент может выполнять: чтение файлов, выполнение команд, редактирование кода, поиск по кодовой базе и т.д.

## Структура инструмента

```typescript
// src/core/prompts/system-prompt/tools/my_tool.ts
import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"

const id = SkycodeDefaultTool.MY_TOOL

const generic: SkycodeToolSpec = {
  variant: ModelFamily.GENERIC,
  id,
  name: "my_tool",
  description: "Делает X, когда нужно Y",
  parameters: [
    {
      name: "required_param",
      required: true,
      instruction: "Для чего нужен этот параметр",
      usage: "example_value"
    }
  ],
  contextRequirements: (ctx) => ctx.someCondition // необязательно
}

export const my_tool_variants = [generic]
```

## Пошаговая инструкция

### Шаг 1: Добавить ID в enum

```typescript
// src/shared/tools.ts
export enum SkycodeDefaultTool {
  MY_TOOL = "my_tool"
}
```

### Шаг 2: Создать файл спецификации

Создайте `src/core/prompts/system-prompt/tools/my_tool.ts` со структурой выше.

### Шаг 3: Экспортировать

```typescript
// src/core/prompts/system-prompt/tools/index.ts
export * from "./my_tool"
```

### Шаг 4: Зарегистрировать варианты

```typescript
// src/core/prompts/system-prompt/tools/init.ts
import { my_tool_variants } from "./my_tool"

export function registerSkycodeToolSets(): void {
  const allToolVariants = [
    ...my_tool_variants
  ]
  allToolVariants.forEach((v) => SkycodeToolSet.register(v))
}
```

### Шаг 5: Добавить в конфиги вариантов моделей

```typescript
// src/core/prompts/system-prompt/variants/generic/config.ts
export const config = createVariant(ModelFamily.GENERIC)
  .tools(SkycodeDefaultTool.MY_TOOL)
  .build()
```

### Шаг 6: Создать обработчик

```typescript
// src/core/task/tools/handlers/MyToolHandler.ts
export class MyToolHandler implements IFullyManagedTool {
  readonly name = SkycodeDefaultTool.MY_TOOL

  getDescription(block: ToolUse): string {
    return `[${block.name} for '${block.params.input}']`
  }

  async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
    const input: string | undefined = block.params.input
    const result = await doSomething(input)
    return result
  }
}
```

Два типа обработчиков:

- **`IFullyManagedTool`** — обработчик сам управляет UI (ask/say). Большинство инструментов.
- **`IToolHandler` + `IPartialBlockHandler`** — для инструментов, обрабатывающих частичные блоки при стриминге.

### Шаг 7: Зарегистрировать обработчик

```typescript
// src/core/task/ToolExecutor.ts
this.coordinator.register(new MyToolHandler())
```

### Шаг 8: Добавить параметры в парсер

```typescript
// src/core/assistant-message/index.ts
export const toolParamNames = [
  "input",  // ваш новый параметр
] as const
```

## Поток подтверждения (Approval Flow)

Для инструментов, выполняющих опасные действия (удаление, запись, выполнение команд):

```typescript
const autoApproveResult = config.autoApprover
  ? config.autoApprover.shouldAutoApproveTool(SkycodeDefaultTool.MY_TOOL)
  : false

if (!didAutoApprove) {
  const didApprove = await ToolResultUtils.askApprovalAndPushFeedback(
    "tool", message, config
  )
  if (!didApprove) return formatResponse.toolDenied()
}
```

## Варианты для разных моделей

```typescript
const generic: SkycodeToolSpec = {
  variant: ModelFamily.GENERIC,
  // базовая версия
}

const nextGen: SkycodeToolSpec = {
  ...generic,
  variant: ModelFamily.NEXT_GEN,
  description: "Расширенное описание для более способных моделей..."
}

export const my_tool_variants = [generic, nextGen]
```

## Существующие инструменты

| Инструмент | Файл | Назначение |
|------------|------|------------|
| `read_file` | `read_file.ts` | Чтение файлов |
| `write_to_file` | `write_to_file.ts` | Создание файлов |
| `replace_in_file` | `replace_in_file.ts` | Редактирование файлов |
| `execute_command` | `execute_command.ts` | Запуск команд |
| `delete_block` | `delete_block.ts` | Удаление блоков кода |
| `codebase_search` | `codebase_search.ts` | Семантический поиск |
| `edit_notebook` | `edit_notebook.ts` | Редактирование Jupyter-ноутбуков |
