/**
 * RemoteEmbeddingProvider — generates embeddings via an OpenAI-compatible API.
 *
 * Compatible with:
 * - OpenAI (text-embedding-3-small, text-embedding-ada-002, etc.)
 * - Any OpenAI-compatible endpoint (Voyage, HuggingFace TEI, vLLM, etc.)
 */
import type { EmbeddingProvider } from "../types"

/** Maximum texts per API request (OpenAI limit is ~2048, we use a safe default) */
const MAX_BATCH_SIZE = 100

/** Response format from OpenAI-compatible /v1/embeddings endpoint */
interface EmbeddingApiResponse {
	data: Array<{
		embedding: number[]
		index: number
	}>
	model: string
	usage: {
		prompt_tokens: number
		total_tokens: number
	}
}

export class RemoteEmbeddingProvider implements EmbeddingProvider {
	readonly id: string
	private _dimensions: number = 0

	get dimensions(): number {
		return this._dimensions
	}

	constructor(
		private readonly apiUrl: string,
		private readonly apiKey: string,
		private readonly model: string,
	) {
		this.id = `remote-${model}`
	}

	async embed(texts: string[], _textType?: "query" | "passage"): Promise<number[][]> {
		if (texts.length === 0) {
			return []
		}

		const allResults: number[][] = []

		// Process in batches
		for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
			const batch = texts.slice(i, i + MAX_BATCH_SIZE)
			const batchResults = await this.embedBatch(batch)
			allResults.push(...batchResults)
		}

		return allResults
	}

	private async embedBatch(texts: string[]): Promise<number[][]> {
		const url = this.apiUrl.endsWith("/embeddings")
			? this.apiUrl
			: this.apiUrl.endsWith("/")
				? `${this.apiUrl}embeddings`
				: `${this.apiUrl}/embeddings`

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		}
		if (this.apiKey) {
			headers["Authorization"] = `Bearer ${this.apiKey}`
		}

		const body = JSON.stringify({
			model: this.model,
			input: texts,
		})

		const response = await fetch(url, {
			method: "POST",
			headers,
			body,
		})

		if (!response.ok) {
			const errorText = await response.text().catch(() => "unknown error")
			throw new Error(
				`Embedding API error ${response.status}: ${errorText}`,
			)
		}

		const json = (await response.json()) as EmbeddingApiResponse

		if (!json.data || !Array.isArray(json.data)) {
			throw new Error("Invalid response from embedding API: missing data array")
		}

		// Sort by index to ensure correct ordering
		const sorted = json.data.sort((a, b) => a.index - b.index)
		const embeddings = sorted.map((item) => item.embedding)

		// Detect dimensions from first response
		if (this._dimensions === 0 && embeddings.length > 0) {
			this._dimensions = embeddings[0].length
		}

		return embeddings
	}

	dispose(): void {
		// No resources to release
	}
}
