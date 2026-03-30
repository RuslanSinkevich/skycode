/**
 * EmbeddingWorkerManager — manages a Worker Thread for embedding computations.
 * Implements EmbeddingProvider so it's a drop-in replacement for LocalEmbeddingProvider.
 *
 * The model loads once on first use, subsequent calls reuse the same worker.
 * If the worker crashes, it is automatically restarted on next embed() call.
 */
import { Worker } from "node:worker_threads"
import * as path from "node:path"
import type { EmbeddingProvider } from "../types"
import type { LocalModelId } from "../../../shared/IndexingTypes"
import { getModelMeta, type EmbeddingModelMeta } from "../models/EmbeddingModelRegistry"

/** Max chars per text chunk — longer chunks are truncated before sending to the worker */
const MAX_EMBED_CHARS = 2000

export class EmbeddingWorkerManager implements EmbeddingProvider {
	readonly id = "local-worker-thread"
	get dimensions(): number {
		return this.modelMeta.dimensions
	}

	private modelMeta: EmbeddingModelMeta
	private worker: Worker | null = null
	private ready = false
	private readyPromise: Promise<void> | null = null
	private requestId = 0
	private pendingRequests = new Map<
		number,
		{
			resolve: (embeddings: number[][]) => void
			reject: (error: Error) => void
		}
	>()

	constructor(
		private readonly extensionPath: string,
		modelId: LocalModelId = "mini",
	) {
		this.modelMeta = getModelMeta(modelId)
	}

	/**
	 * Start the worker and load the model.
	 * Resolves when the model is ready to process requests.
	 */
	async start(): Promise<void> {
		if (this.ready && this.worker) return
		if (this.readyPromise) return this.readyPromise

		this.readyPromise = new Promise<void>((resolve, reject) => {
			// Worker bundle is produced by esbuild at dist/embedding-worker.js
			const workerPath = path.join(this.extensionPath, "dist", "embedding-worker.js")

			try {
				this.worker = new Worker(workerPath)
			} catch (err: any) {
				this.readyPromise = null
				reject(new Error(`Failed to start embedding worker: ${err.message}`))
				return
			}

			const onMessage = (msg: any) => {
				switch (msg.type) {
					case "ready":
						this.ready = true
						resolve()
						break

					case "result": {
						const pending = this.pendingRequests.get(msg.id)
						if (pending) {
							pending.resolve(msg.embeddings)
							this.pendingRequests.delete(msg.id)
						}
						break
					}

					case "error": {
						if (msg.id === -1) {
							// Init error — reject the ready promise
							reject(new Error(msg.message))
							return
						}
						const pendingErr = this.pendingRequests.get(msg.id)
						if (pendingErr) {
							pendingErr.reject(new Error(msg.message))
							this.pendingRequests.delete(msg.id)
						}
						break
					}
				}
			}

			this.worker.on("message", onMessage)

			this.worker.on("error", (err) => {
				console.error("[Skycode Worker] Worker error:", err)
				// Reject all pending requests
				for (const [, pending] of this.pendingRequests) {
					pending.reject(err)
				}
				this.pendingRequests.clear()
				this.reset()
				reject(err)
			})

			this.worker.on("exit", (code) => {
				if (code !== 0) {
					const err = new Error(`Embedding worker exited with code ${code}`)
					console.error("[Skycode Worker]", err.message)
					for (const [, pending] of this.pendingRequests) {
						pending.reject(err)
					}
					this.pendingRequests.clear()
				}
				this.reset()
			})

			// Tell the worker to initialize the model
			this.worker.postMessage({
				type: "init",
				extensionPath: this.extensionPath,
				modelId: this.modelMeta.id,
				huggingFaceId: this.modelMeta.huggingFaceId,
				dimensions: this.modelMeta.dimensions,
				requiresPrefix: this.modelMeta.requiresPrefix,
				allowRemoteModels: this.modelMeta.allowRemoteModels,
			})
		})

		return this.readyPromise
	}

	/**
	 * Compute embeddings for an array of texts.
	 * Texts longer than MAX_EMBED_CHARS are truncated.
	 * @param textType "passage" for documents, "query" for search queries (relevant for e5 models)
	 */
	async embed(texts: string[], textType?: "query" | "passage"): Promise<number[][]> {
		if (texts.length === 0) return []

		if (!this.ready || !this.worker) {
			await this.start()
		}

		if (!this.worker) {
			throw new Error("Embedding worker not available")
		}

		const truncated = texts.map((t) => (t.length > MAX_EMBED_CHARS ? t.slice(0, MAX_EMBED_CHARS) : t))

		const id = this.requestId++

		return new Promise<number[][]>((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject })
			this.worker!.postMessage({ type: "embed", id, texts: truncated, textType })
		})
	}

	/**
	 * Dispose of the worker and release resources.
	 */
	dispose(): void {
		if (this.worker) {
			try {
				this.worker.postMessage({ type: "dispose" })
			} catch {
				// Worker might already be terminated
			}
			// Force terminate after a short grace period
			const w = this.worker
			setTimeout(() => {
				try {
					w.terminate()
				} catch {
					// Already terminated
				}
			}, 1000)
		}
		this.reset()
	}

	private reset(): void {
		this.worker = null
		this.ready = false
		this.readyPromise = null
	}
}
