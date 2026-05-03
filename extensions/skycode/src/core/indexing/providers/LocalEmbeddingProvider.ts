/**
 * LocalEmbeddingProvider — generates embeddings locally using transformers.js (WASM).
 * Uses the paraphrase-multilingual-MiniLM-L12-v2 model which produces 384-dimensional vectors.
 *
 * @deprecated This runs the model on the extension host and is no longer wired into
 * EmbeddingRouter. Use EmbeddingWorkerManager (which runs in a Worker Thread) instead.
 * This file is kept as a reference fallback in case the worker bundle cannot be loaded.
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

		// Per-text loop (see embedding-worker.ts for rationale: WASM peak memory is
		// unstable when batching variable-length inputs, can crash the host).
		for (let i = 0; i < texts.length; i++) {
			const text = this.truncateForEmbedding(texts[i])

			try {
				const output = await extractor([text], {
					pooling: "mean",
					normalize: true,
				})

				results.push(...output.tolist())
			} catch (err: any) {
				console.warn(`[Skycode Indexing] Failed to embed chunk ${i} (${text.length} chars):`, err.message)
				results.push(new Array(this.dimensions).fill(0))
			}

			if (i % 5 === 0) {
				await new Promise((resolve) => setImmediate(resolve))
			}
		}

		return results
	}

	dispose(): void {
		EmbeddingsPipeline.dispose()
	}
}
