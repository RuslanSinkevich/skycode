/**
 * Worker Thread for computing embeddings.
 * Runs in a separate thread to avoid blocking the extension host.
 *
 * Communication protocol:
 *   Main → Worker:  InitMessage | EmbedMessage | DisposeMessage
 *   Worker → Main:  ReadyMessage | EmbedResultMessage | ErrorMessage | ProgressMessage
 */
import { parentPort } from "node:worker_threads"
import * as path from "node:path"
import * as fs from "node:fs"
import * as https from "node:https"
import * as http from "node:http"
import { pathToFileURL } from "node:url"
import { createUnzip } from "node:zlib"
import { pipeline as streamPipeline, Writable } from "node:stream"

// ── Message types ──────────────────────────────────────────────

interface InitMessage {
	type: "init"
	extensionPath: string
	modelId?: string
	huggingFaceId?: string
	dimensions?: number
	requiresPrefix?: boolean
	downloadUrl?: string
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

// ── Model download from Skycode CDN ────────────────────────────

function sendProgress(phase: string, percent: number): void {
	parentPort?.postMessage({ type: "download_progress", phase, percent })
}

async function httpGet(url: string): Promise<http.IncomingMessage> {
	return new Promise((resolve, reject) => {
		const mod = url.startsWith("https") ? https : http
		mod.get(url, { headers: { "User-Agent": "Skycode" } }, (res) => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				const next = res.headers.location.startsWith("http")
					? res.headers.location
					: new URL(res.headers.location, url).href
				httpGet(next).then(resolve, reject)
				return
			}
			resolve(res)
		}).on("error", reject)
	})
}

async function ensureModelDownloaded(
	modelsDir: string,
	huggingFaceId: string,
	downloadUrl: string,
): Promise<void> {
	const modelDir = path.join(modelsDir, huggingFaceId)
	const onnxPath = path.join(modelDir, "onnx", "model_quantized.onnx")
	if (fs.existsSync(onnxPath)) return

	sendProgress("downloading", 0)
	const res = await httpGet(downloadUrl)
	if (!res.statusCode || res.statusCode !== 200) {
		throw new Error(`Failed to download model: HTTP ${res.statusCode} from ${downloadUrl}`)
	}

	const totalBytes = parseInt(res.headers["content-length"] || "0", 10)
	const zipPath = path.join(modelsDir, `_download_${Date.now()}.zip`)
	fs.mkdirSync(modelsDir, { recursive: true })

	await new Promise<void>((resolve, reject) => {
		let downloaded = 0
		const ws = fs.createWriteStream(zipPath)
		res.on("data", (chunk: Buffer) => {
			downloaded += chunk.length
			if (totalBytes > 0) {
				sendProgress("downloading", Math.round((downloaded / totalBytes) * 100))
			}
		})
		res.pipe(ws)
		ws.on("finish", () => { ws.close(); resolve() })
		ws.on("error", reject)
		res.on("error", reject)
	})

	sendProgress("extracting", 0)
	await extractZip(zipPath, modelDir)
	fs.unlinkSync(zipPath)
	sendProgress("extracting", 100)
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
	const { open } = await import("node:fs/promises")
	const fh = await open(zipPath, "r")
	const stat = await fh.stat()
	const buf = Buffer.alloc(stat.size)
	await fh.read(buf, 0, stat.size, 0)
	await fh.close()

	let offset = 0
	while (offset < buf.length) {
		const sig = buf.readUInt32LE(offset)
		if (sig !== 0x04034b50) break

		const compMethod = buf.readUInt16LE(offset + 8)
		const compSize = buf.readUInt32LE(offset + 18)
		const uncompSize = buf.readUInt32LE(offset + 22)
		const nameLen = buf.readUInt16LE(offset + 26)
		const extraLen = buf.readUInt16LE(offset + 28)
		const fileName = buf.toString("utf8", offset + 30, offset + 30 + nameLen)
		const dataStart = offset + 30 + nameLen + extraLen

		if (!fileName.endsWith("/")) {
			const outPath = path.join(destDir, fileName)
			fs.mkdirSync(path.dirname(outPath), { recursive: true })

			if (compMethod === 0) {
				fs.writeFileSync(outPath, buf.subarray(dataStart, dataStart + uncompSize))
			} else if (compMethod === 8) {
				const { inflateRawSync } = await import("node:zlib")
				const inflated = inflateRawSync(buf.subarray(dataStart, dataStart + compSize))
				fs.writeFileSync(outPath, inflated)
			}
		}

		offset = dataStart + compSize
	}
}

// ── Model loading ──────────────────────────────────────────────

async function initModel(msg: InitMessage): Promise<void> {
	const {
		extensionPath,
		huggingFaceId = "paraphrase-multilingual-MiniLM-L12-v2",
		dimensions = 384,
		requiresPrefix = false,
		downloadUrl,
	} = msg

	try {
		const modelsDir = path.join(extensionPath, "models")

		if (downloadUrl) {
			await ensureModelDownloaded(modelsDir, huggingFaceId, downloadUrl)
		}

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
		env.allowRemoteModels = false
		env.localModelPath = modelsDir

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
