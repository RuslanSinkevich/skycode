# Skycode AI

> Русская версия (основная): [README.md](README.md)

**AI agent for VS Code that works with your own models**

Skycode is a VS Code extension (`skycode.skycode-ai`, "Skycode AI" on the Marketplace). It connects to an OpenAI-compatible gateway (vLLM, LiteLLM), a local model (Ollama, LM Studio), or cloud providers such as GigaChat, YandexGPT and OpenRouter. No accounts, no subscriptions. Based on [Cline](https://github.com/cline/cline), licensed under Apache 2.0.

<p align="center">
  <img src="./docs/skycode/hero-demo.gif" alt="Skycode AI in action" width="900">
</p>

<p align="center">
  <a href="https://ruslansinkevich.ru/skycode/">Website</a> ·
  <a href="https://marketplace.visualstudio.com/items?itemName=skycode.skycode-ai">Marketplace</a> ·
  <a href="#documentation">Docs (EN)</a> ·
  <a href="./README.md">Русский</a> ·
  <a href="https://github.com/RuslanSinkevich/skycode">GitHub</a>
</p>

---

## Features

### AI Agent with 30+ Tools

| Capability | Description |
|-----------|-------------|
| **Read & edit files** | Full file creation, block replacement, patches |
| **Execute commands** | Terminal: build, test, git, npm, Docker |
| **Code search** | `codebase_search`: repo map (tree-sitter) + ripgrep; optional vector index |
| **Regex search** | Fast pattern matching via ripgrep |
| **Web search** | Search the internet for information |
| **Browser automation** | Puppeteer: screenshots, clicks, form filling |
| **MCP integrations** | Connect external services (Context7, databases, APIs) |
| **Diagnostics** | Read ESLint, TypeScript, and other linter errors |
| **Jupyter Notebooks** | Create and edit notebook cells |

### 5 Operating Modes

| Mode | Purpose | Tools |
|------|---------|-------|
| **Act** | Default. Execute tasks, edit files, run commands | All |
| **Ask** | Explore code, answer questions | Read-only |
| **Plan** | Gather info, design approach | Read-only + `plan_mode_respond` |
| **Debug** | Systematic debugging with runtime evidence | Read-only + `execute_command` |
| **Chat** | General conversation, any topic | Read-only (on explicit request) |

The agent can dynamically switch between modes during a conversation.

### Inline Diff System v4

- Changes from AI displayed **directly in the editor** (green = added, red = removed)
- **Accept / Reject** buttons per change block
- Per-message snapshots for precise rollback
- Cross-file navigation between pending changes

### Code Search

- `codebase_search` works without indexing: a repo map (declarations via tree-sitter) plus ripgrep text search
- Optional vector index (`skycode.indexing.mode`): hybrid retrieval — semantic + keyword + rerank
- Indexing is off by default. `remote` mode uses any OpenAI-compatible embeddings API. `local` mode does not work in Marketplace builds: the local model and onnxruntime-node are not bundled in the VSIX
- Incremental updates via FileWatcher

### Providers

The default provider is **OpenAI Compatible**; the rest are under "Ещё провайдеры" (more providers).

- Gateways with Qwen-class models (vLLM, LiteLLM) — the primary target scenario
- Local models — Ollama, LM Studio
- **GigaChat** — native function calls (Sber)
- **YandexGPT**
- **OpenRouter** — model aggregator
- OpenAI, Anthropic, Google and other cloud APIs

### Voice Input

Local speech recognition (whisper.cpp).

### Lightweight Mode

Simplified prompts and tools for weaker/free models. 11 prompt variants optimized for specific model families.

---

## Installation

Requires VS Code 1.90 or newer.

- **From the Marketplace:** Extensions view → search "Skycode AI" → Install. Page: [marketplace.visualstudio.com/items?itemName=skycode.skycode-ai](https://marketplace.visualstudio.com/items?itemName=skycode.skycode-ai)
- **From a .vsix:** Extensions → `…` → "Install from VSIX…" (the file is attached to each [GitHub Release](https://github.com/RuslanSinkevich/skycode/releases))

Then: open the **Skycode** panel in the sidebar → gear icon → **Provider** → gateway URL, API key and model name.

## Building from Source

The product lives in `extensions/skycode/`. The repository is still physically a VS Code fork, but the rest of the tree (`src/vs/`, `build/`, etc.) is not used by Skycode.

```bash
cd extensions/skycode
npm ci
cd webview-ui && npm ci && cd ..
npm run protos
npm run package                                   # types + webview + lint + esbuild
npx vsce package --readme-path MARKETPLACE.md     # .vsix
```

More in the [Development Guide](./docs/skycode/en/development/getting-started.md).

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  VS Code                                      │
│  ┌──────────────────────────────────────┐    │
│  │  Skycode Extension                    │    │
│  │  ┌────────┐ ┌──────┐ ┌───────────┐  │    │
│  │  │ Agent  │ │ Diff │ │ Indexing  │  │    │
│  │  │ Loop   │ │ v4   │ │ (SQLite)  │  │    │
│  │  └───┬────┘ └──────┘ └───────────┘  │    │
│  │      ↓                               │    │
│  │  ┌────────┐ ┌──────┐ ┌───────────┐  │    │
│  │  │ 40+   │ │ MCP  │ │ Prompts   │  │    │
│  │  │ APIs  │ │ Hub  │ │ Engine    │  │    │
│  │  └────────┘ └──────┘ └───────────┘  │    │
│  └──────────────────────────────────────┘    │
│                    ↕ gRPC                     │
│  ┌──────────────────────────────────────┐    │
│  │  Webview UI (React)                  │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

| Component | Technology |
|-----------|-----------|
| Platform | VS Code extension (1.90+) |
| Communication | gRPC + Protobuf |
| Chat UI | React |
| Code parsing | Tree-sitter |
| Search | Repo map + ripgrep, optional embedding index |

---

## Documentation

> **Документация на русском:** [docs/skycode/](./docs/skycode/architecture/overview.md)

### Architecture
- [Overview](./docs/skycode/en/architecture/overview.md)
- [Core Module](./docs/skycode/en/architecture/core.md)
- [Context Management](./docs/skycode/en/architecture/context-management.md)

### Systems
- [Inline Diff System v4](./docs/skycode/en/systems/diff-system.md)
- [Codebase Indexing](./docs/skycode/en/systems/indexing-system.md)
- [MCP Integration](./docs/skycode/en/systems/mcp.md)

### Development
- [Getting Started](./docs/skycode/en/development/getting-started.md)
- [Adding Agent Tools](./docs/skycode/en/development/adding-tools.md)
- [Network Requests](./docs/skycode/en/development/network.md)
- [Adding Settings](./docs/skycode/en/development/adding-settings.md)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, code style, and PR guidelines.

---

## Acknowledgments

Skycode is built upon several open-source projects:

- [Cline](https://github.com/cline/cline) (Apache 2.0) — initial extension architecture
- [Continue](https://github.com/continuedev/continue) (Apache 2.0) — embedding pipeline
- [Kilocode](https://github.com/Kilo-Org/kilocode) (Apache 2.0 / MIT) — tool handling patterns

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for full attribution.

## License

[Apache License 2.0](./LICENSE)
