> **Русская версия:** [adding-tools.md](../../development/adding-tools.md)

# Adding Agent Tools

A tool is an action the agent can perform: read a file, run a command, find code. Paths are relative to `extensions/skycode/src/`.

## What you need

1. A tool identifier.
2. A prompt description (name, description, parameters).
3. Wiring the description into the system prompt variants.
4. A handler.
5. Handler registration.
6. Parameter names in the model response parser.

## Steps

### 1. Identifier

```typescript
// shared/tools.ts
export enum SkycodeDefaultTool {
  MY_TOOL = "my_tool",
}
```

### 2. Description

Create `core/prompts/system-prompt/tools/my_tool.ts`.

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
  description: "Does X when Y is needed",
  parameters: [
    {
      name: "input",
      required: true,
      instruction: "What this parameter is for",
      usage: "example_value",
    },
    TASK_PROGRESS_PARAMETER,
  ],
  // contextRequirements: (ctx) => ctx.someCondition,   // optional
}

export const my_tool_variants = [generic]
```

If a model family has no variant of its own, the `GENERIC` variant is used. Add separate variants when the description must differ (for example for native tool calls: `NATIVE_GPT_5`, `NATIVE_NEXT_GEN`).

### 3. Export and register the description

```typescript
// core/prompts/system-prompt/tools/index.ts
export * from "./my_tool"

// core/prompts/system-prompt/tools/init.ts
import { my_tool_variants } from "./my_tool"
// ...and add ...my_tool_variants to the allToolVariants array in registerSkycodeToolSets()
```

### 4. Wire into the prompt variants

In `core/prompts/system-prompt/variants/<variant>/config.ts`, add the tool to the `.tools(...)` list of every variant where it should be available:

```typescript
.tools(
  SkycodeDefaultTool.FILE_READ,
  SkycodeDefaultTool.MY_TOOL,
)
```

Variants are in `variants/` (generic, qwen, xs, next-gen, native-next-gen, gpt-5 and others). After changing prompts, update the snapshots: `UPDATE_SNAPSHOTS=true npm run test:unit`.

### 5. Handler

```typescript
// core/task/tools/handlers/MyToolHandler.ts
export class MyToolHandler implements IFullyManagedTool {
  readonly name = SkycodeDefaultTool.MY_TOOL

  getDescription(block: ToolUse): string {
    return `[${block.name} for '${block.params.input}']`
  }

  async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
    // show the partially received call in the chat (may be minimal)
  }

  async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
    const input = block.params.input
    return await doSomething(input)
  }
}
```

Interfaces (`core/task/tools/ToolExecutorCoordinator.ts`):

- `IToolHandler`: `name`, `execute`, `getDescription`;
- `IPartialBlockHandler`: `handlePartialBlock` for showing the call while the stream is arriving;
- `IFullyManagedTool` combines both. The handler itself is responsible for the approval request and chat messages.

One handler can serve several names through `SharedToolHandler` (`replace_in_file`, `replace_text` and `delete_block` are built this way on top of `WriteToFileToolHandler`).

### 6. Register the handler

```typescript
// core/task/ToolExecutor.ts, registerToolHandlers()
this.coordinator.register(new MyToolHandler())
```

### 7. Parameter names

Add new parameter names to `toolParamNames` in `core/assistant-message/index.ts` so the stream parser recognizes them.

## Approving the action

For actions with side effects, ask the user unless auto-approval is on:

```typescript
const autoApproved = config.callbacks.shouldAutoApproveTool(SkycodeDefaultTool.MY_TOOL)
if (!autoApproved) {
  const didApprove = await ToolResultUtils.askApprovalAndPushFeedback("tool", message, config)
  if (!didApprove) {
    return formatResponse.toolDenied()
  }
}
```

Auto-approval rules are in `core/task/tools/autoApprove.ts`. Add the new tool there too, otherwise it counts as needing approval. Mode restrictions (Ask, Chat, Plan, lightweight mode) are lists in `core/task/ToolExecutor.ts`. If the tool writes to files, it must go through `DiffSystem`, like `WriteToFileToolHandler`.

## Existing tools

Descriptions are in `core/prompts/system-prompt/tools/`, handlers in `core/task/tools/handlers/`.

| Group | Tools |
|---|---|
| Files | `read_file`, `read_symbol`, `write_to_file`, `replace_in_file`, `replace_text`, `delete_block`, `apply_patch`, `edit_notebook` |
| Search | `codebase_search`, `search_files`, `glob`, `list_files`, `list_code_definition_names`, `read_diagnostics` |
| Commands | `execute_command`, `check_background_command` |
| Web and browser | `web_search`, `web_fetch`, `browser_action` |
| MCP | `use_mcp_tool`, `access_mcp_resource`, `load_mcp_documentation` |
| Chat output | `show_chart`, `show_visual`, `generate_explanation` |
| Flow control | `ask_followup_question`, `attempt_completion`, `plan_mode_respond`, `act_mode_respond`, `new_task`, `focus_chain`, `use_skill` |
| Context | `condense`, `summarize_task` |
