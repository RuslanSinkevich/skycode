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
	modelId?: string
	huggingFaceId?: string
	dimensions?: number
	requiresPrefix?: boolean
	allowRemoteModels?: boolean
}

interface EmbedMessage {
	type: "embed"
	id: number
	texts: string[]
	/** "query" adds "query: " prefix, "passage" adds "passage: " prefix (for e5 models) */
	textType?: "query" | "passage"
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
let modelRequiresPrefix = false

// ── Model loading ──────────────────────────────────────────────

async function initModel(msg: InitMessage): Promise<void> {
	const {
		extensionPath,
		huggingFaceId = "paraphrase-multilingual-MiniLM-L12-v2",
		dimensions = 384,
		requiresPrefix = false,
		allowRemoteModels: allowRemote = false,
	} = msg

	try {
		const transformersPath = path.join(
			extensionPath,
			"vendor",
			"modules",
			"@xenova",
			"transformers",
			"src",
			"transformers.js",
		)

		const transformersUrl = pathToFileURL(transformersPath).href
		const { env, pipeline: createPipeline } = await import(transformersUrl)

		env.allowLocalModels = true
		env.allowRemoteModels = allowRemote
		env.localModelPath = path.join(extensionPath, "models")

		pipeline = await createPipeline("feature-extraction", huggingFaceId)
		modelRequiresPrefix = requiresPrefix

		parentPort?.postMessage({ type: "ready", dimensions } satisfies ReadyMessage)
	} catch (err: any) {
		parentPort?.postMessage({
			type: "error",
			id: -1,
			message: `Model init failed: ${err.message}`,
		} satisfies ErrorMessage)
	}
}

// ── Embedding computation ──────────────────────────────────────

async function computeEmbeddings(id: number, texts: string[], textType?: "query" | "passage"): Promise<void> {
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
		const prefixed = modelRequiresPrefix && textType
			? texts.map((t) => `${textType}: ${t}`)
			: texts

		for (let i = 0; i < prefixed.length; i++) {
			const output = await pipeline([prefixed[i]], {
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
			await initModel(msg)
			break
		case "embed":
			await computeEmbeddings(msg.id, msg.texts, msg.textType)
			break
		case "dispose":
			pipeline = null
			process.exit(0)
			break
	}
})
