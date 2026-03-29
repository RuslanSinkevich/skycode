/**
 * Shared types for the Codebase Indexing system.
 * Used by both the extension backend and the webview UI.
 */

/** Embedding provider mode */
export type IndexingMode = "off" | "local" | "remote"

/** Configuration for the indexing system */
export interface IndexingConfig {
	mode: IndexingMode
	remoteApiUrl: string
	remoteApiKey: string
	remoteModel: string
	maxFileSize: number
	ignoredPatterns: string[]
}

/** Default indexing configuration */
export const DEFAULT_INDEXING_CONFIG: IndexingConfig = {
	mode: "local",
	remoteApiUrl: "",
	remoteApiKey: "",
	remoteModel: "text-embedding-3-small",
	maxFileSize: 524288, // 512KB — 100KB was too small, large files with important code were silently dropped
	ignoredPatterns: [
		"node_modules",
		".git",
		"dist",
		"build",
		"out",
		".next",
		".nuxt",
		"__pycache__",
		".venv",
		"venv",
		".env",
		"coverage",
		".cache",
		".turbo",
		"*.min.js",
		"*.min.css",
		"*.map",
		"*.lock",
		"package-lock.json",
		"yarn.lock",
		"pnpm-lock.yaml",
	],
}

/** A chunk of code with its embedding vector */
export interface CodeChunk {
	id: string
	filePath: string
	content: string
	startLine: number
	endLine: number
	language: string
}

/** A chunk stored with its embedding */
export interface ChunkWithEmbedding extends CodeChunk {
	embedding: number[]
}

/** Current indexing phase */
export type IndexingPhase = "idle" | "walking" | "chunking" | "loading_model" | "embedding" | "saving" | "done"

/** Progress update sent from backend to webview */
export interface IndexingProgress {
	status: "idle" | "indexing" | "paused" | "error" | "complete"
	phase: IndexingPhase
	filesTotal: number
	filesIndexed: number
	chunksTotal: number
	chunksIndexed: number
	currentFile?: string
	lastIndexedAt?: number
	errorMessage?: string
}

/** Default idle progress state */
export const DEFAULT_INDEXING_PROGRESS: IndexingProgress = {
	status: "idle",
	phase: "idle",
	filesTotal: 0,
	filesIndexed: 0,
	chunksTotal: 0,
	chunksIndexed: 0,
}

/** Search result from the indexing system */
export interface IndexSearchResult {
	filePath: string
	content: string
	startLine: number
	endLine: number
	score: number
	language: string
}
