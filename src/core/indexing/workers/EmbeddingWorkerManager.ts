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
import { resolveModelMetaForPath, type EmbeddingModelMeta } from "../models/EmbeddingModelRegistry"
import { Logger } from "@/shared/services/Logger"

/** Max chars per text chunk — longer chunks are truncated before sending to the worker */
const MAX_EMBED_CHARS = 2000

/** [SKYCODE-PERF] Hard timeout for a single embed request — protects against
 *  worker hangs that would otherwise leak resolvers in `pendingRequests` forever. */
const EMBED_REQUEST_TIMEOUT_MS = 60_000

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
			timer: NodeJS.Timeout
		}
	>()

	constructor(
		private readonly extensionPath: string,
		modelId: LocalModelId = "mini",
	) {
		this.modelMeta = resolveModelMetaForPath(extensionPath, modelId)
	}

	/**
	 * Start the worker and load the model.
	 * Resolves when the model is ready to process requests.
	 */
	async start(): Promise<void> {
		if (this.ready && this.worker) { return }
		if (this.readyPromise) { return this.readyPromise }

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
							clearTimeout(pending.timer)
							this.pendingRequests.delete(msg.id)
							pending.resolve(msg.embeddings)
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
							clearTimeout(pendingErr.timer)
							this.pendingRequests.delete(msg.id)
							pendingErr.reject(new Error(msg.message))
						}
						break
					}
				}
			}

			this.worker.on("message", onMessage)

			this.worker.on("error", (err) => {
				Logger.error("[Skycode Worker] Worker error:", err)
				// Reject all pending requests
				this.rejectAllPending(err)
				this.reset()
				reject(err)
			})

			this.worker.on("exit", (code) => {
				if (code !== 0) {
					const err = new Error(`Embedding worker exited with code ${code}`)
					Logger.error("[Skycode Worker]", err.message)
					this.rejectAllPending(err)
				} else {
					// Clean exit but pending requests will never get a response — fail them
					this.rejectAllPending(new Error("Embedding worker exited before responding"))
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
				downloadUrl: this.modelMeta.downloadUrl,
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
		if (texts.length === 0) { return [] }

		if (!this.ready || !this.worker) {
			await this.start()
		}

		if (!this.worker) {
			throw new Error("Embedding worker not available")
		}

		const truncated = texts.map((t) => (t.length > MAX_EMBED_CHARS ? t.slice(0, MAX_EMBED_CHARS) : t))

		const id = this.requestId++

		return new Promise<number[][]>((resolve, reject) => {
			// [SKYCODE-PERF] Per-request hard timeout. If the worker hangs,
			// clear the resolver so it doesn't leak in the Map forever.
			const timer = setTimeout(() => {
				if (this.pendingRequests.delete(id)) {
					reject(new Error(`Embedding worker timed out after ${EMBED_REQUEST_TIMEOUT_MS}ms`))
				}
			}, EMBED_REQUEST_TIMEOUT_MS)
			// Don't keep the Node event loop alive just for this timer.
			timer.unref?.()

			this.pendingRequests.set(id, { resolve, reject, timer })
			try {
				this.worker!.postMessage({ type: "embed", id, texts: truncated, textType })
			} catch (err) {
				clearTimeout(timer)
				this.pendingRequests.delete(id)
				reject(err as Error)
			}
		})
	}

	/**
	 * Dispose of the worker and release resources.
	 */
	dispose(): void {
		// [SKYCODE-PERF] Reject any in-flight requests immediately so callers
		// don't wait the full timeout after a dispose.
		this.rejectAllPending(new Error("Embedding worker disposed"))
		if (this.worker) {
			try {
				this.worker.postMessage({ type: "dispose" })
			} catch {
				// Worker might already be terminated
			}
			// Drop our message/error/exit listeners so they can't fire on a
			// terminated worker (the Worker object is otherwise GC-rooted by them).
			try {
				this.worker.removeAllListeners()
			} catch {
				// already detached
			}
			// Force terminate after a short grace period
			const w = this.worker
			const t = setTimeout(() => {
				try {
					w.terminate()
				} catch {
					// Already terminated
				}
			}, 1000)
			t.unref?.()
		}
		this.reset()
	}

	private rejectAllPending(err: Error): void {
		if (this.pendingRequests.size === 0) { return }
		const pending = Array.from(this.pendingRequests.values())
		this.pendingRequests.clear()
		for (const p of pending) {
			clearTimeout(p.timer)
			try {
				p.reject(err)
			} catch {
				// listener threw; ignore so we keep cleaning the rest
			}
		}
	}

	private reset(): void {
		this.worker = null
		this.ready = false
		this.readyPromise = null
	}
}
