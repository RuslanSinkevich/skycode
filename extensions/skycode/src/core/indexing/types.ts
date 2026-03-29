/**
 * Internal types for the indexing subsystem.
 * For shared types (used by both backend and webview), see @shared/IndexingTypes.ts
 */

/** Interface that all embedding providers must implement */
export interface EmbeddingProvider {
	/** Unique identifier for this provider */
	readonly id: string
	/** Dimensionality of the embedding vectors produced */
	readonly dimensions: number
	/**
	 * Compute embeddings for an array of text chunks.
	 * @param texts - Array of text strings to embed
	 * @returns Array of embedding vectors (same order as input)
	 */
	embed(texts: string[]): Promise<number[][]>
	/** Dispose of any resources held by the provider */
	dispose(): void
}

/** Row stored in SQLite for each indexed chunk */
export interface ChunkRow {
	id: string
	filePath: string
	content: string
	startLine: number
	endLine: number
	language: string
	/** Byte offset into the vectors.bin file where this chunk's embedding starts */
	vectorOffset: number
	/** Hash of the file contents at indexing time (for change detection) */
	fileHash: string
}

/** Metadata about the index stored in SQLite */
export interface IndexMetadata {
	/** Provider ID used to create these embeddings (determines vector dimensions) */
	embeddingProviderId: string
	/** Dimensionality of vectors */
	dimensions: number
	/** Timestamp of the last completed indexing run */
	lastIndexedAt: number
	/** Total number of chunks in the index */
	totalChunks: number
}
