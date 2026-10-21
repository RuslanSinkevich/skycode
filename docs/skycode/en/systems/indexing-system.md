> **Русская версия:** [indexing-system.md](../../systems/indexing-system.md)

# Code Search and Indexing

This page describes two levels of search: the repository map (always on) and the optional vector index. Paths are relative to `extensions/skycode/src/`.

## Search without an index

By default the `codebase_search` tool searches without an index and without downloading models:

1. **Repository map** (`services/repo-map/`). A list of project declarations (classes, methods, functions, SQL procedures and tables) with file and line. Files are listed with `rg --files` (which respects `.gitignore`), declarations are extracted with tree-sitter. The cache is `~/.skycode/repo-map/<hash>.json`; on the next run only changed files are parsed.
2. **ripgrep text search** by the query words. Files are ranked by how many different query words they contain. Comments and strings are searched too.

Handler: `core/task/tools/handlers/CodebaseSearchToolHandler.ts`; search without an index: `services/repo-map/searchWithoutIndex.ts`. A short project overview from the map is also added to the first task message.

## Vector index

The index is optional and **off** by default (`skycode.indexing.mode = "off"`). When it is on and ready, `codebase_search` uses it together with keyword search.

| Mode | What it does | Availability |
|---|---|---|
| `off` | No index | Default |
| `remote` | Embeddings come from an OpenAI-compatible API (`/v1/embeddings`) | Works in the Marketplace build |
| `local` | Embeddings come from a local model in a separate thread (transformers.js, onnxruntime) | Unavailable in the Marketplace build: the models and `onnxruntime-node` are not in the VSIX |

In `remote` mode, code fragments are sent to the address you set. `remote` works with any server that has a compatible API (OpenAI, vLLM, HuggingFace TEI and others).

### Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `skycode.indexing.mode` | `"off" \| "local" \| "remote"` | `"off"` | Mode |
| `skycode.indexing.remoteApiUrl` | string | `""` | Embeddings API URL |
| `skycode.indexing.remoteApiKey` | string | `""` | API key |
| `skycode.indexing.remoteModel` | string | `"text-embedding-3-small"` | Embedding model |
| `skycode.indexing.localModel` | `"mini" \| "base" \| "large"` | `"mini"` | Local model (`local` mode only) |
| `skycode.indexing.maxFileSize` | number | `102400` | Maximum file size in bytes |
| `skycode.indexing.ignoredPatterns` | string[] | `node_modules`, `.git`, `dist` and others | What not to index |

The settings are also available in the "Indexing" («Индексация») tab of the Skycode settings.

Local models: `mini` (`paraphrase-multilingual-MiniLM-L12-v2`, dimension 384), `base` (`multilingual-e5-base`, 768), `large` (`multilingual-e5-large`, 1024). If the model files are not next to the extension, the worker downloads an archive from the project storage.

## Structure

```
IndexingService — core/indexing/IndexingService.ts
├── FileWalker          file walk: .gitignore, ignoredPatterns, maxFileSize, binary files
├── CodeChunker         splits into chunks (tree-sitter, with a fallback without it)
├── EmbeddingRouter     picks the provider
│   ├── EmbeddingWorkerManager   local model, separate thread
│   └── RemoteEmbeddingProvider  OpenAI-compatible API, up to 100 texts per request
├── IndexStorage        index storage
│   └── VectorSearch, KeywordSearch
└── SearchEngine        hybrid search and result formatting
```

**Storage.** `~/.skycode/indexing/<workspace hash>/`. Main variant: `index.db` (built-in `node:sqlite`). If `node:sqlite` is not available in the VS Code runtime, the fallback is used: the files `index.json`, `chunks.json` and `vectors.bin`. It is slower on large repositories.

**Pipeline.**

1. `FileWalker` walks the workspace.
2. `CodeChunker` splits files into chunks.
3. Chunks go to embedding in batches of 16.
4. The result is saved to the storage.
5. `FileSystemWatcher` tracks changes. Events are grouped (700 ms), and the changed file is re-chunked. Change is detected by the MD5 of the content. A deleted file is removed from the index.

**Search.** `SearchEngine` merges semantic search (`VectorSearch`), keyword search and path search, then reranks the results (`Reranker`). For non-Latin queries the semantic weight is higher. If embedding fails, search falls back to keywords. The tool answer is wrapped in a `<codebase_context>` block.

## Commands

| Command | What it does |
|---|---|
| `skycode.indexing.reindex` | Full reindex |
| `skycode.indexing.clear` | Clear the index |
| `skycode.indexing.pause` | Pause |
| `skycode.indexing.resume` | Resume |
| `skycode.indexing.clearEmbeddingCache` | Delete local embedding model files |

## Adding an embedding provider

1. Implement `EmbeddingProvider` from `core/indexing/types.ts`.
2. Add a branch to `EmbeddingRouter.ts`.
3. Add a value to `skycode.indexing.mode` in `package.json`.
4. Add the UI in `webview-ui/src/components/settings/sections/IndexingSettingsSection.tsx`.
