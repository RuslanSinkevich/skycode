> **Русская версия:** [core.md](../../architecture/core.md)

# Core Module

Request path: `extension.ts` → `Controller` → `Task`. All paths below are relative to `extensions/skycode/src/`.

## Layout of `core/`

```
core/
├── api/             # Model providers, retries, message conversion
├── assistant-message/ # Parsing the model response stream (text and tool calls)
├── context/         # Context management, session changelog, rules and instructions
├── controller/      # Controller and webview request handlers (by domain)
├── diff-v2/         # Change review: storage, engine, decorations
├── hooks/           # Lifecycle hooks (do not run on Windows)
├── ignore/          # .skycodeignore
├── indexing/        # Optional vector index
├── inline-edit/     # Editing selected code with Ctrl+Shift+K
├── mentions/        # @-mentions in the chat
├── permissions/     # Command classifier and permissions
├── prompts/         # System prompt and tool responses
├── session/         # SessionManager, tabs, ApprovalGate, ApiSlotLimiter
├── slash-commands/  # Slash commands
├── storage/         # StateManager, on-disk paths
├── task/            # Task, ToolExecutor, tool handlers
├── webview/         # WebviewProvider
├── workflow/        # Multi-step workflows
└── workspace/       # Multi-root workspaces
```

## Task

`Controller.initTask()` creates a `Task`. `Task.startTask()` or `Task.resumeTaskFromHistory()` starts the loop:

```
initiateTaskLoop()
  → recursivelyMakeSkycodeRequests()
      → attemptApiRequest()       # streaming model request
      → stream parsing            # text, reasoning, tool calls
      → ToolExecutor              # run tools
      → next request or ask("completion_result")
```

Before the first edit for each user message, `DiffSystem.startCheckpoint(...)` is called. This creates the change group that the rollback snapshot is attached to.

### Guards during stream parsing

- **Repetition loops** (`task/repetitionLoop.ts`). The detector receives the response text and the reasoning. It does not check the content of tool calls, so repeated code does not trigger it. If one fragment repeats many times, or a short pattern runs for a very long time, the response is aborted and the model gets a note.
- **Truncated tool call** (`task/truncatedToolCall.ts`). If the response is cut inside a call to `write_to_file`, `replace_in_file`, `apply_patch`, `edit_notebook`, `delete_block`, `replace_text`, `execute_command` and similar, the call is not executed. The model is asked to split the work into parts.
- **Repeated call.** An exact repeat of the same tool call comes with a soft note (`toolCallSignature.ts`).
- **Mistake counter.** After `maxConsecutiveMistakes` consecutive mistakes (default 3), the agent stops and waits for the user.
- **Call budget for weak and medium models.** `ToolExecutor` counts calls per turn. At 80% of the limit the model gets a warning; when the limit is used up it is told to call `attempt_completion`. Strong models have no limit (model tiers are described in [Context management](./context-management.md)). Limits: medium tier 80 calls, weak tier 25 (`src/shared/prompts.ts`).

### Qwen sampling

For models with `qwen` in the name, `core/api/providers/qwenSampling.ts` sets temperature 0.6 (when the setting is 0 or empty), `top_p` 0.95 and `top_k` 20. If a gateway answers 400 to unknown fields, those two parameters are no longer sent to that address until restart.

## ToolExecutor

`task/ToolExecutor.ts` registers handlers in `ToolExecutorCoordinator` and checks restrictions before running a tool:

- **Ask and Chat:** file writes, `apply_patch`, `edit_notebook`, `execute_command`, browser and MCP are blocked. The model gets an error message.
- **Plan:** with `strictPlanModeEnabled` (on by default) write tools are blocked.
- **Lightweight mode** (`lightweightMode`, for weak models): `execute_command`, `replace_in_file`, `apply_patch` and file deletion are blocked. The model uses `replace_text`, `delete_block` and `write_to_file` instead.

Handlers are in `task/tools/handlers/`. Tool descriptions for the prompt are in `prompts/system-prompt/tools/`. How to add a tool: [Adding agent tools](../development/adding-tools.md).

## Permissions and auto-approval

`task/tools/autoApprove.ts` decides whether to ask the user. Settings are in `autoApprovalSettings.actions` (the "Permissions" tab):

| Setting | Default | Meaning |
|---|---|---|
| `readFiles` | on | Read files in the working folder |
| `readFilesExternally` | off | Read outside the working folder |
| `editFiles` | on | Edit files in the working folder |
| `editFilesExternally` | off | Edit outside the working folder |
| `executeSafeCommands` | on | Whitelisted (read-only) commands |
| `executeNonDestructiveCommands` | off | Everything except clearly dangerous |
| `executeAllCommands` | off | Any command |
| `deleteFiles` | off | Delete files |
| `editNotebooks` | off | Jupyter notebooks |
| `useBrowser` | on | Browser |
| `useMcp` | on | MCP, but each MCP tool still needs approval until auto-approve is switched on for it |

`permissions/CommandSafetyClassifier.ts` puts a command into one of three classes:

- `safe`: whitelisted command, read-only;
- `unsafe`: blacklisted command (`rm`, `sudo`, `ssh`, package installs and so on), a dangerous flag, or output redirection;
- `unknown`: the command is not recognized.

The "safe commands" mode approves only `safe`. The "everything except dangerous" mode approves `safe` and `unknown`. For chains and pipes, every segment is evaluated.

## Sessions and tabs

`session/SessionManager.ts` holds the sessions. Each tab in the UI maps to a session. The tab status (running, awaiting confirmation, done, queued, stopped) is derived in `session/tabs.ts` from the task state. `ApiSlotLimiter` lets at most three model requests run at once; other tasks wait for a free slot.

`ApprovalGate` is a promise-based ask/response mechanism. It replaced timer polling and keeps a queue of answers that arrive before the task reaches its wait.

## Controller

`controller/index.ts` creates and aborts tasks (`initTask`, `cancelTask`, `clearTask`) and pushes state to the webview (`getStateToPostToWebview`). Other operations are in `controller/task/`: `deleteFromMessage`, `retryFromMessage`, `resendFromMessage`, `interruptAndSend` (interrupt the stream and handle the user message at once), `newTab`, `switchTab`, `closeTab`. Deleting and retrying roll files back through `DiffSystem`.

## State

`storage/StateManager.ts` keeps settings in memory and writes them to the VS Code `globalState`. API keys go to SecretStorage. Workspace state (the list of pending changes) goes to `workspaceState`. Each VS Code window reads the disk once at start.

Task files live in `tasks/<taskId>/` of the extension data folder:

```
api_conversation_history.json   # history sent to the model
ui_messages.json                # chat messages
context_history.json            # context edits (stubs, compaction)
task_metadata.json
```

File snapshots and the state of pending changes are described in [Change review](../systems/diff-system.md).

## Hooks

`hooks/` runs scripts from `.skycoderules/hooks` on lifecycle events (`TaskStart`, `TaskComplete`, `PreToolUse`, `PostToolUse`, `PreCompact` and others). Hooks are disabled on Windows (`getHooksEnabledSafe`).

## See also

- [Context management](./context-management.md)
- [Change review](../systems/diff-system.md)
- [Adding agent tools](../development/adding-tools.md)
