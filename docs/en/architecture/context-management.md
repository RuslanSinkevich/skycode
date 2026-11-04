> **Русская версия:** [context-management.md](../../architecture/context-management.md)

# Context Management

Skycode is built for models with a context of about 100k tokens. This page describes how the agent saves context and what happens when it fills up. Paths are relative to `src/`.

## How the agent saves context

| Measure | What it does | Where |
|---|---|---|
| Line ranges | `read_file` accepts `start_line` and `end_line`. Soft limit for one read: 2000 lines | `core/task/tools/handlers/readFileSlicing.ts` |
| `read_symbol` | Reads definitions by name (up to 5 names per call, up to 400 lines per definition) using tree-sitter. Comments and attributes above the definition are included | `ReadSymbolToolHandler.ts`, `readSymbolCore.ts` |
| Stub on re-read | If a file has not changed since the last read and that result is still in the history, a "File unchanged since you read it" line is returned instead of the text. Reading with `start_line=1` returns the file again | `readFileSlicing.ts` |
| Edits without full echo | For files longer than 300 lines, only the changed regions with 5 lines of context are returned after an edit | `core/prompts/editSnippet.ts` |
| Command output | Long output is cut to its head and tail (at most 200 lines). If the output exceeds 1000 lines or 512 KB, it is written to a file, and the context gets the first and last 100 lines plus the file path | `integrations/terminal/` |
| The `environment_details` block | Sections that did not change since the last request are not sent again. Time is sent at most once per 10 minutes. After history truncation the whole block is sent. Terminal output in the block is capped at 40 lines and 4000 characters | `core/task/environmentDetailsDiff.ts` |
| Repository map | A short project overview in the first task message (about 6000 characters) instead of reading many files | `services/repo-map/` |
| Duplicate file reads | Before compaction, repeated reads of one file are replaced with stubs | `FileReadOptimizer.ts` |

## Auto-compaction

The `useAutoCondense` setting is on by default for all models. The threshold is `autoCondenseThreshold` (a fraction of the window, default **0.75**). There is no UI control for it.

**Algorithm:**

1. Before each request, `ContextManager.shouldCompactContextWindow()` compares the tokens of the previous request with the threshold.
2. If the threshold is exceeded, file-read optimization is tried first (`FileReadOptimizer`). If it frees enough space, compaction is skipped.
3. Otherwise the `summarizeTask` prompt is appended to the user message, and the model calls the `summarize_task` tool with a structured summary: the task and intent, technical decisions, changed files, open items, the next step, and a list of required files (Required Files).
4. `SummarizeTaskHandler` replaces the old history with the summary and automatically re-reads up to 8 files from the list.

**The threshold in tokens** comes from `getAutoCompactThresholdTokens`: the smaller of `window × autoCondenseThreshold` and `maxAllowedSize`. `maxAllowedSize` depends on the model tier:

- strong models: window 64k gives 37k, 128k gives 98k, 200k gives 160k, other windows `max(window − 40k, window × 0.8)`;
- medium models: `window × 0.7`;
- weak models: `window × 0.5`.

The tier is determined by `getModelCapabilityTier` (`src/utils/model-utils.ts`). Qwen, GLM, Hermes and Devstral are generally medium. Strong are the flagships from an internal list (for example `qwen3-max`, `qwen3-coder-plus`, `glm-4.6`) and models that appear in no list. Heavily quantized weights (q4, gguf, awq and so on) on a local or self-hosted gateway count as weak. You can set the tier manually with the `sessionBudgetMode` setting.

## Manual compaction and the context ring

A context fill ring sits near the input. Clicking it opens a popover with:

- the context size and how much is left before auto-compaction;
- a bar with a breakdown by category: system prompt and tools, files and search, commands, edits, dialog, service data, other;
- a hint when one category takes most of the space;
- the **"Compact session"** («Сжать сессию») button. It sends the `/compact` command to the chat. The button is active only when the agent is waiting for your reply (finished the task, asked a question, showed a plan).

The breakdown is computed by `core/context/context-management/contextBreakdown.ts` from the messages that actually go to the model.

## Truncation instead of compaction

If `useAutoCondense` is switched off, the older truncation applies. After a request, `totalTokens >= maxAllowedSize` is checked. File-read optimization is tried first. If that is not enough, half or a quarter of the messages are removed from the middle of the history (the first user/assistant pair is kept), and a notice about the removed history is added to the first message.

## Overflow errors

If the context still overflows, `context-error-handling.ts` recognizes provider errors and starts recovery.

## Long-term memory

Memory holds short facts about the user and their work, shared by all tabs and future tasks. It is turned on in settings ("Context" → "Long-term memory", on by default). File: `Documents/Skycode/Memory/memory.json`; the "Open memory file" button opens it in the editor, and manual edits are picked up on the next request.

The agent decides what to remember on its own with the `remember` tool and removes a fact with `forget`. It does not ask for approval, but after a save VS Code shows a notification with an "Undo" button. The limits are checked by code (`core/memory/memory.ts`), not by the model:

- at most 3 saves per task, a fact of up to 200 characters, a type from the list: `user`, `preference`, `project`, `event`;
- a quote from the user's messages in this task is required; without it the fact is not saved. Text from files, pages and command output does not count;
- keys, tokens, passwords and card numbers are rejected;
- a similar fact (60% or more of the words match) updates the old entry instead of adding a new one.

A new entry is unconfirmed. It becomes confirmed when two other tasks start and the entry is not deleted, or when the same fact comes up again in another task. At the end of the system prompt, the `## MEMORY` block lists confirmed entries (up to 30) and, separately, unconfirmed ones (up to 10) marked as lower confidence. When there are more than 10 unconfirmed entries, the oldest one is dropped. Entries with the `project` scope are visible only in their own workspace folder.

When memory is empty, the `## MEMORY` block is still present: one line on when to call `remember`. In addition, messages with new words from the user (task, answer, feedback) get a short `# Memory` reminder next to `# Current Mode`. Without it, Qwen noticed a fact in its reasoning but did not save it.

## Key files

| File | Purpose |
|---|---|
| `core/context/context-management/ContextManager.ts` | Threshold check, read optimization, truncation |
| `core/context/context-management/context-window-utils.ts` | `contextWindow`, `maxAllowedSize`, compaction threshold |
| `core/context/context-management/contextBreakdown.ts` | Category breakdown for the ring |
| `core/context/context-management/FileReadOptimizer.ts` | Replacing repeated reads with stubs |
| `core/context/context-management/context-error-handling.ts` | Provider errors |
| `core/prompts/contextManagement.ts` | The `summarizeTask` prompt |
| `core/task/tools/handlers/SummarizeTaskHandler.ts` | Handling `summarize_task` |
| `core/task/environmentDetailsDiff.ts` | Sending only changed sections |
| `webview-ui/src/components/chat/context-ring/` | The context ring |
| `core/memory/memory.ts` | Checks, duplicates, confirmation, the `## MEMORY` block |
| `core/memory/MemoryStore.ts` | Memory file, queue for writes from different tabs |
| `core/task/tools/handlers/MemoryToolHandler.ts` | The `remember` and `forget` tools |
