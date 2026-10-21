# Skycode AI

> Русская версия: [README.md](README.md)

**An AI coding agent for VS Code that works with your own models.**

Skycode AI is a VS Code extension. It works with a corporate OpenAI-compatible gateway (vLLM, LiteLLM), local models (Ollama, LM Studio), GigaChat, YandexGPT, OpenRouter and other providers. It is built for closed corporate networks and self-hosted models. No accounts and no telemetry: requests go only to the provider you configured.

<p align="center">
  <img src="./docs/skycode/hero-demo.gif" alt="Skycode AI at work" width="900">
</p>

<p align="center">
  <a href="https://ruslansinkevich.ru/skycode/">Website</a> ·
  <a href="https://marketplace.visualstudio.com/items?itemName=skycode.skycode-ai">Marketplace</a> ·
  <a href="https://github.com/RuslanSinkevich/skycode/releases">Releases</a> ·
  <a href="https://habr.com/ru/articles/1096732/">Habr article (Russian)</a> ·
  <a href="#documentation">Documentation</a>
</p>

---

## About this repository

The repository is physically a fork of VS Code, so it holds many Microsoft files and a long commit history. The product lives only in [`extensions/skycode/`](./extensions/skycode). Everything else (`src/vs/`, `product.json`, gulp builds) belongs to the legacy Skycode desktop fork, which is no longer shipped.

## Installation

Requires VS Code 1.90 or newer. Extension ID: `skycode.skycode-ai`.

- From the Marketplace: Extensions view, search for "Skycode AI", Install.
- From a file: Extensions view, `…` menu, "Install from VSIX…". The `.vsix` is attached to every [GitHub release](https://github.com/RuslanSinkevich/skycode/releases) (tags `ext-vX.Y.Z`).

If you had the extension under the old ID `skycode.skycode`, task history is copied to the new storage on first start. API keys cannot be migrated, so enter them again.

## Quick start

1. Open the **Skycode** panel in the side bar.
2. Gear icon, **Provider** tab. **OpenAI Compatible** is selected by default. Other providers are under "More providers" («Ещё провайдеры»).
3. Enter the gateway URL (for example `https://llm.company.ru/v1`), the API key and the model name.
4. Set the model context size and write a task in the chat.

## Features

### Providers

OpenAI Compatible (default), Ollama, LM Studio, LiteLLM, GigaChat, YandexGPT, DeepSeek, Alibaba Qwen, Qwen Code, OpenRouter, Anthropic, OpenAI, Google Gemini, GitHub Copilot (through VS Code LM), Claude Code, OpenAI Codex. The main scenario is a gateway with a Qwen-class model.

### Agent and modes

The agent has more than 30 tools: reading and editing files, terminal commands, code search, `read_symbol`, diagnostics, Jupyter, a browser (puppeteer-core), MCP, web search and page fetching (enabled in the "Web" settings tab, off by default).

| Mode | What it does |
|---|---|
| Act («Акт») | Performs tasks: edits files, runs commands. Default mode |
| Ask («Вопрос») | Reads code and answers questions. Writing, commands, browser and MCP are blocked |
| Plan («План») | Gathers information and proposes a plan. Edits wait until you switch to Act |
| Debug («Дебаг») | Step-by-step debugging: evidence first, then hypotheses, then a fix. Same tools as Act |
| Chat («Чат») | Conversation without touching the project. Tools only on explicit request; writing and commands are blocked |

Approvals for actions are configured in the "Permissions" tab.

### Change review

The agent writes directly to files. Changes stay pending until you accept or reject them.

- Added lines get a green background across the whole line.
- Deleted lines are shown as a thin red line at the place of deletion. Hovering shows the removed text and an "Open comparison" link.
- There are no accept or reject buttons inside the editor.
- Accept the current change: `Ctrl+Shift+Y`. Reject: `Ctrl+Shift+N`. Next and previous: `Alt+]` and `Alt+[` (on macOS `Cmd+Shift+Y` and `Cmd+Shift+N`).
- "Accept all changes in file" and "Reject all changes in file" are in the Command Palette.
- A bar above the chat input shows "N files +X −Y", arrows to move between changes, and the buttons "Reject" («Отменить») and "Accept" («Принять»). Expanded, it lists files; each has accept and reject.
- Clicking a file in the bar opens the standard diff editor "(before agent ↔ now)".
- A snapshot of files is kept for every message. Deleting a message or retrying rolls files back to the state before it.

Details: [Change review](./docs/skycode/en/systems/diff-system.md).

### Context economy

Tuned for models with a context of about 100k tokens.

- `read_file` reads line ranges. `read_symbol` reads a single class or method by name (tree-sitter).
- Re-reading an unchanged file returns a short stub.
- After editing a large file, only the changed parts come back, not the whole file.
- Terminal output is cut to its head and tail.
- The `environment_details` block is sent only for the parts that changed.
- Automatic history compaction is on by default for all models. Default threshold: 75% of the window.
- The context ring near the input shows usage by category and a "Compact session" («Сжать сессию») button.

Details: [Context management](./docs/skycode/en/architecture/context-management.md).

### Resilience to model failures

- If the model repeats the same text (in the answer or in reasoning, including long short-period patterns), the response is stopped and the model gets a hint.
- A truncated tool call (file write, edit, command) is not executed.
- For Qwen models the defaults are temperature 0.6, `top_p` 0.95, `top_k` 20. Temperature 0 is replaced with 0.6.

### Interface

- Tasks in tabs run in parallel (at most three model requests at the same time). The rest wait in a queue.
- While the agent works, new messages go to a queue. `Enter` in an empty input sends the top queued message and interrupts the agent.
- Mermaid diagrams, charts and tables (`show_chart`) and static visuals (`show_visual`) render in the chat.
- Long lines in tables and code blocks wrap.

### Code search

`codebase_search` works without indexing: a repository map (declarations via tree-sitter) plus ripgrep. The vector index is optional and off by default. The `remote` mode works with any OpenAI-compatible embeddings API. The `local` mode is unavailable in the Marketplace build. See [Indexing](./docs/skycode/en/systems/indexing-system.md).

### MCP

Connect servers over Model Context Protocol: `stdio`, SSE and Streamable HTTP. MCP tool calls require approval by default. See [MCP](./docs/skycode/en/systems/mcp.md).

### Voice input

Russian uses GigaAM v3 with punctuation on sherpa-onnx. Text appears while you speak. Recognition is local. A one-time download of about 230 MB is needed from the "Voice" («Голос») settings tab. Other languages use whisper.cpp. See [Voice input](./docs/skycode/en/systems/voice-input.md).

## Development

Work happens in `extensions/skycode`. You do not need to build VS Code itself.

```bash
cd extensions/skycode
npm ci
cd webview-ui && npm ci && cd ..
npm run protos
npm run package
```

Checks, packaging and release are described in [CONTRIBUTING.md](./CONTRIBUTING.md) and the [development guide](./docs/skycode/en/development/getting-started.md).

## Documentation

Russian versions are in [docs/skycode/](./docs/skycode/architecture/overview.md).

### Architecture
- [Architecture overview](./docs/skycode/en/architecture/overview.md)
- [Core module](./docs/skycode/en/architecture/core.md)
- [Context management](./docs/skycode/en/architecture/context-management.md)

### Systems
- [Change review](./docs/skycode/en/systems/diff-system.md)
- [Voice input](./docs/skycode/en/systems/voice-input.md)
- [Codebase indexing](./docs/skycode/en/systems/indexing-system.md)
- [MCP integration](./docs/skycode/en/systems/mcp.md)

### Development
- [Development guide](./docs/skycode/en/development/getting-started.md)
- [Adding agent tools](./docs/skycode/en/development/adding-tools.md)
- [Adding settings](./docs/skycode/en/development/adding-settings.md)
- [Network requests and proxy](./docs/skycode/en/development/network.md)

Security questions: [SECURITY.md](./SECURITY.md).

## Support the project

[CloudTips](https://pay.cloudtips.ru/p/3a95e808) · [Boosty](https://boosty.to/skycodeai) · author on Telegram: [@ruslansinkevich](https://t.me/ruslansinkevich)

## Acknowledgements

Skycode uses ideas and code from the open-source agents [Cline](https://github.com/cline/cline), [Kilo Code](https://github.com/Kilo-Org/kilocode) and [Continue](https://github.com/continuedev/continue) (Apache-2.0). Full list: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

[Apache License 2.0](./LICENSE)
