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
 * Compute cosine similarity between two vectors.
 * Both vectors must have the same length.
 * Returns a value between -1 and 1.
 */
function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
	let dotProduct = 0
	let normA = 0
	let normB = 0

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB)
	if (denominator === 0) return 0

	return dotProduct / denominator
}

/**
 * Search the index for chunks most similar to the query embedding.
 *
 * @param storage   - The IndexStorage instance to search
 * @param queryVec  - The embedding vector of the search query
 * @param topK      - Number of top results to return (default: 10)
 * @param threshold - Minimum similarity score to include (default: 0.2)
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

	// Convert query to Float32Array for fast computation
	const queryFloat = new Float32Array(queryVec)

	// Score all chunks
	const scored: Array<{ chunk: ChunkRow; score: number }> = []

	for (const chunk of chunks) {
		const vec = storage.getVector(chunk.vectorOffset)
		const score = cosineSimilarity(queryFloat, vec)

		if (score >= threshold) {
			scored.push({ chunk, score })
		}
	}

	// Sort by descending score and take topK
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
