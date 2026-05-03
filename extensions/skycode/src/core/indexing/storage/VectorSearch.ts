/**
 * VectorSearch — brute-force cosine similarity search over embedded vectors.
 *
 * For projects up to ~10K files (~50K chunks) this runs in <100ms.
 * Can be replaced with an ANN (approximate nearest neighbor) implementation later.
 */
import type { IndexSearchResult } from "@shared/IndexingTypes"
import type { ChunkRow } from "../types"
import type { IndexStorage } from "./IndexStorage"

/**
 * Dot product between two equal-length vectors. When both inputs are L2-normalized
 * (which is the case for our embedding pipeline), the dot product equals cosine
 * similarity and no division is required.
 */
function dot(a: Float32Array, b: Float32Array): number {
	let s = 0
	for (let i = 0; i < a.length; i++) {
		s += a[i] * b[i]
	}
	return s
}

/**
 * Normalize a vector in-place to unit length. Returns the input for chaining.
 * No-op for already-normalized vectors (norm ≈ 1).
 */
function normalizeInPlace(v: Float32Array): Float32Array {
	let norm = 0
	for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
	if (norm === 0) return v
	const inv = 1 / Math.sqrt(norm)
	for (let i = 0; i < v.length; i++) v[i] *= inv
	return v
}

/**
 * Search the index for chunks most similar to the query embedding.
 *
 * Performance notes:
 *  - Stored vectors are L2-normalized at index time (transformers.js pipeline is
 *    configured with `normalize: true`), so we just normalize the query once
 *    and compute a dot product per chunk — no per-chunk sqrt/divide.
 *  - `storage.getVector` returns a zero-copy subarray view, so we avoid ~1.5KB
 *    allocation per chunk during search.
 *
 * @param storage   - The IndexStorage instance to search
 * @param queryVec  - The embedding vector of the search query
 * @param topK      - Number of top results to return (default: 10)
 * @param threshold - Minimum similarity score to include (default: 0.15)
 * @returns Array of IndexSearchResult sorted by descending similarity
 */
export function vectorSearch(
	storage: IndexStorage,
	queryVec: number[],
	topK: number = 10,
	threshold: number = 0.15,
): IndexSearchResult[] {
	const chunks = storage.getChunks()
	const dimensions = storage.getDimensions()

	if (chunks.length === 0 || dimensions === 0) {
		return []
	}

	// Normalize query once (no-op if already unit length).
	const queryFloat = normalizeInPlace(new Float32Array(queryVec))

	// Top-K min-heap would be optimal for large N, but for the target size
	// (≤50K chunks) a full scan + sort is fine and simpler.
	const scored: Array<{ chunk: ChunkRow; score: number }> = []

	for (const chunk of chunks) {
		const vec = storage.getVector(chunk.vectorOffset) // zero-copy view
		const score = dot(queryFloat, vec)
		if (score >= threshold) {
			scored.push({ chunk, score })
		}
	}

	scored.sort((a, b) => b.score - a.score)
	const topResults = scored.slice(0, topK)

	return topResults.map(({ chunk, score }) => ({
		filePath: chunk.filePath,
		content: chunk.content,
		startLine: chunk.startLine,
		endLine: chunk.endLine,
		score,
		language: chunk.language,
	}))
}
