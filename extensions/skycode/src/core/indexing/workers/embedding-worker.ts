/**
 * Worker Thread for computing embeddings.
 * Runs in a separate thread to avoid blocking the extension host.
 *
 * Communication protocol:
 *   Main → Worker:  InitMessage | EmbedMessage | DisposeMessage
 *   Worker → Main:  ReadyMessage | EmbedResultMessage | ErrorMessage
 */
import { parentPort } from "node:worker_threads"
import * as path from "node:path"
import { pathToFileURL } from "node:url"

// ── Message types ──────────────────────────────────────────────

interface InitMessage {
	type: "init"
	extensionPath: string
}

interface EmbedMessage {
	type: "embed"
	id: number
	texts: string[]
}

interface DisposeMessage {
	type: "dispose"
}

type IncomingMessage = InitMessage | EmbedMessage | DisposeMessage

interface ReadyMessage {
	type: "ready"
	dimensions: number
}

interface EmbedResultMessage {
	type: "result"
	id: number
	embeddings: number[][]
}

interface ErrorMessage {
	type: "error"
	id: number
	message: string
}

// ── State ──────────────────────────────────────────────────────

let pipeline: any = null

// ── Model loading ──────────────────────────────────────────────

async function initModel(extensionPath: string): Promise<void> {
	try {
		// Dynamic import — transformers.js WASM library shipped in vendor/
		const transformersPath = path.join(
			extensionPath,
			"vendor",
			"modules",
			"@xenova",
			"transformers",
			"src",
			"transformers.js",
		)

		// On Windows, absolute paths must be file:// URLs for ESM dynamic import
		const transformersUrl = pathToFileURL(transformersPath).href
		const { env, pipeline: createPipeline } = await import(transformersUrl)

		env.allowLocalModels = true
		env.allowRemoteModels = false
		env.localModelPath = path.join(extensionPath, "models")

		pipeline = await createPipeline("feature-extraction", "paraphrase-multilingual-MiniLM-L12-v2")

		parentPort?.postMessage({ type: "ready", dimensions: 384 } satisfies ReadyMessage)
	} catch (err: any) {
		parentPort?.postMessage({
			type: "error",
			id: -1,
			message: `Model init failed: ${err.message}`,
		} satisfies ErrorMessage)
	}
}

// ── Embedding computation ──────────────────────────────────────

async function computeEmbeddings(id: number, texts: string[]): Promise<void> {
	if (!pipeline) {
		parentPort?.postMessage({
			type: "error",
			id,
			message: "Model not initialized",
		} satisfies ErrorMessage)
		return
	}

	try {
		const results: number[][] = []

		for (let i = 0; i < texts.length; i++) {
			const output = await pipeline([texts[i]], {
				pooling: "mean",
				normalize: true,
			})
			results.push(...output.tolist())
		}

		parentPort?.postMessage({
			type: "result",
			id,
			embeddings: results,
		} satisfies EmbedResultMessage)
	} catch (err: any) {
		parentPort?.postMessage({
			type: "error",
			id,
			message: err.message,
		} satisfies ErrorMessage)
	}
}

// ── Message handler ────────────────────────────────────────────

parentPort?.on("message", async (msg: IncomingMessage) => {
	switch (msg.type) {
		case "init":
			await initModel(msg.extensionPath)
			break
		case "embed":
			await computeEmbeddings(msg.id, msg.texts)
			break
		case "dispose":
			pipeline = null
			process.exit(0)
			break
	}
})
