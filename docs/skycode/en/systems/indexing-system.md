> **Русская версия:** [indexing-system.md](../../systems/indexing-system.md)

# Codebase Indexing System

Optional semantic indexing for code search. Enables the AI agent to retrieve relevant context from the entire project before responding.

Indexing is **off** by default (`skycode.indexing.mode = "off"`): `codebase_search` works without it, using a repo map (declarations via tree-sitter, `src/services/repo-map/`) and ripgrep text search. The working mode for Marketplace builds is `remote` (OpenAI-compatible embeddings API). The `local` mode (transformers.js / onnxruntime) does not work in Marketplace builds: the local model and onnxruntime-node are not bundled in the VSIX.

## Architecture

```
IndexingService (orchestrator) — src/core/indexing/IndexingService.ts
├── FileWalker (file traversal)
│   └── Respects .gitignore, ignoredPatterns, maxFileSize, binary files
├── CodeChunker (splitting into chunks)
│   └── Tree-sitter chunking (with fallback to simple chunker)
├── EmbeddingRouter → provider selection
│   ├── LocalEmbeddingProvider (transformers.js WASM + multilingual MiniLM)
│   └── RemoteEmbeddingProvider (OpenAI-compatible /v1/embeddings API)
├── Storage
│   ├── IndexStorage (SQLite by default, JSON fallback when native unavailable)
│   └── VectorSearch (brute-force cosine similarity on in-memory vectors)
└── SearchEngine (hybrid: semantic + keyword + rerank + prompt formatting)
```

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `skycode.indexing.mode` | `"off" \| "local" \| "remote"` | `"off"` | Indexing mode (`local` is unavailable in Marketplace builds) |
| `skycode.indexing.remoteApiUrl` | string | `""` | Remote API URL |
| `skycode.indexing.remoteApiKey` | string | `""` | API key |
| `skycode.indexing.remoteModel` | string | `"text-embedding-3-small"` | Model name |
| `skycode.indexing.maxFileSize` | number | `102400` | Max file size (bytes) |
| `skycode.indexing.ignoredPatterns` | string[] | `[node_modules, .git, ...]` | Ignored patterns |

## Index Storage

Stored locally in `~/.skycode/indexing/{workspace-hash}/`.

Primary backend:
- `index.db` (SQLite) — metadata, chunks, and vectors (BLOB)

Fallback backend (when native SQLite is unavailable):
- `index.json` — metadata
- `chunks.json` — chunk metadata array
- `vectors.bin` — Float32Array vectors

## Embedding Providers

### Local (does not work in Marketplace builds)

The model and onnxruntime-node are not bundled in the VSIX; this mode only works in a build where they are supplied manually.

- **Library:** `@xenova/transformers` (transformers.js)
- **Backend:** WASM (no native modules, works in any environment)
- **Model:** `paraphrase-multilingual-MiniLM-L12-v2` (multilingual, Russian support)
- **Dimensions:** 384
- **Speed:** ~50–100 chunks/sec

### Remote

- **Protocol:** OpenAI Embeddings API (`POST /v1/embeddings`)
- **Compatible with:** OpenAI, Voyage AI, HuggingFace TEI, vLLM, any OpenAI-compatible endpoint
- **Batching:** up to 100 texts per request

## Indexing Pipeline

1. **File traversal** — `FileWalker` recursively walks the workspace, skipping ignored/binary/oversized files
2. **Chunking** — `CodeChunker` uses Tree-sitter for AST-aware chunking, falls back to simple chunker on error
3. **Embedding** — batches of 32 chunks through the selected provider
4. **Storage** — into SQLite (`index.db`) or JSON fallback
5. **FileWatcher** — tracks changes and updates incrementally

## Incremental Updates

- `FileSystemWatcher` monitors create/change/delete events
- Change/create events are debounced (burst-safe)
- On file change: old chunks removed, file re-chunked and re-embedded
- On file delete: chunks removed from index
- Comparison by MD5 hash of file contents

## Search

- **Hybrid retrieval:** semantic (`VectorSearch`) + keyword (`KeywordSearch`)
- **Rerank:** post-retrieval reranking rules for improved precision
- Reduces noise on multilingual queries

## Performance

| Project | Files | Chunks | Indexing (local model) | Search |
|---------|-------|--------|-----------------|--------|
| Small (~100 files) | ~100 | ~500 | ~30 sec | <10ms |
| Medium (~2000 files) | ~2000 | ~10K | ~5 min | ~30ms |
| Large (~10000 files) | ~10K | ~50K | ~20 min | ~80ms |

## Agent Integration

The search is exposed as a `codebase_search` tool:
- **Tool ID:** `SkycodeDefaultTool.CODEBASE_SEARCH`
- **Handler:** `src/core/task/tools/handlers/CodebaseSearchToolHandler.ts`
- Calls `SearchEngine.getContextForPrompt(query)` and returns `<codebase_context>` with relevant chunks

## Commands

| Command | Description |
|---------|-------------|
| `skycode.indexing.reindex` | Full re-indexing |
| `skycode.indexing.clear` | Clear entire index |
| `skycode.indexing.pause` | Pause indexing |
| `skycode.indexing.resume` | Resume after pause |

## Extending

### Adding a new embedding provider

1. Create a class implementing `EmbeddingProvider` from `src/core/indexing/types.ts`
2. Add a variant in `EmbeddingRouter.ts`
3. Add an option to `skycode.indexing.mode` enum in `package.json`
4. Add UI in `IndexingSettingsSection.tsx`
