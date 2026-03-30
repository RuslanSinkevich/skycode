/**
 * LocalEmbeddingProvider — generates embeddings locally using transformers.js (WASM).
 * Uses the paraphrase-multilingual-MiniLM-L12-v2 model which produces 384-dimensional vectors.
 *
 * Based on Continue's TransformersJsEmbeddingsProvider.
 * No native modules needed — runs entirely in WASM.
 */
import * as path from "node:path"
import type { EmbeddingProvider } from "../types"

/** Singleton pipeline instance */
class EmbeddingsPipeline {
	static instance: any | null = null
	static loading: Promise<any> | null = null

	static async getInstance(extensionPath: string): Promise<any> {
		if (EmbeddingsPipeline.instance !== null) {
			return EmbeddingsPipeline.instance
		}
		if (EmbeddingsPipeline.loading !== null) {
			return EmbeddingsPipeline.loading
		}

		EmbeddingsPipeline.loading = (async () => {
			// Dynamic import — transformers.js is a WASM-based library
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore — vendor JS module without type declarations
			const { env, pipeline } = await import("../../../../vendor/modules/@xenova/transformers/src/transformers.js")

			env.allowLocalModels = true
			env.allowRemoteModels = true
			env.localModelPath = path.join(extensionPath, "models")

			const extractor = await pipeline("feature-extraction", "paraphrase-multilingual-MiniLM-L12-v2")
			EmbeddingsPipeline.instance = extractor
			EmbeddingsPipeline.loading = null
			return extractor
		})()

		return EmbeddingsPipeline.loading
	}

	static dispose() {
		EmbeddingsPipeline.instance = null
		EmbeddingsPipeline.loading = null
	}
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
	readonly id = "local-transformers-js"
	readonly dimensions = 384
	private static readonly MAX_EMBED_CHARS = 2000

	constructor(private readonly extensionPath: string) {}

	private truncateForEmbedding(text: string): string {
		if (text.length <= LocalEmbeddingProvider.MAX_EMBED_CHARS) {
			return text
		}
		return text.slice(0, LocalEmbeddingProvider.MAX_EMBED_CHARS)
	}

	async embed(texts: string[], _textType?: "query" | "passage"): Promise<number[][]> {
		if (texts.length === 0) {
			return []
		}

		const extractor = await EmbeddingsPipeline.getInstance(this.extensionPath)
		if (!extractor) {
			throw new Error("Failed to initialize local embedding pipeline")
		}

		const results: number[][] = []

		// Process one chunk at a time to avoid blocking the extension host
		for (let i = 0; i < texts.length; i++) {
			const originalText = texts[i]
			const text = this.truncateForEmbedding(originalText)

			try {
				const output = await extractor([text], {
					pooling: "mean",
					normalize: true,
				})

				results.push(...output.tolist())
			} catch (err: any) {
				// If embedding fails for a chunk, skip it but log the error
				console.warn(`[Skycode Indexing] Failed to embed chunk ${i} (${text.length} chars):`, err.message)
				// Push zero vector as placeholder to maintain array alignment
				results.push(new Array(this.dimensions).fill(0))
			}

			// Yield to event loop between chunks (prevents UI freezing)
			if (i % 5 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 1))
			}
		}

		return results
	}

	dispose(): void {
		EmbeddingsPipeline.dispose()
	}
}
