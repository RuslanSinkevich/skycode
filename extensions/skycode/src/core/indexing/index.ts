/**
 * Codebase Indexing System — barrel exports.
 *
 * Usage:
 *   import { IndexingService, SearchEngine } from "@core/indexing"
 */
export { IndexingService } from "./IndexingService"
export { SearchEngine } from "./SearchEngine"
export { IndexStorage } from "./storage/IndexStorage"
export { vectorSearch } from "./storage/VectorSearch"
export { keywordSearch } from "./storage/KeywordSearch"
export { walkFiles, countFiles } from "./FileWalker"
export { chunkFile, setTreeSitterWasmDir } from "./CodeChunker"
export { chunkFileTreeSitter } from "./TreeSitterChunker"
export { rerankResults } from "./Reranker"
export { createEmbeddingProvider } from "./EmbeddingRouter"
export type { EmbeddingProvider, ChunkRow, IndexMetadata } from "./types"
