/**
 * IndexingService — основной оркестратор системы индексации кодовой базы.
 *
 * Отвечает за:
 * - Чтение конфигурации из VS Code settings
 * - Запуск/остановку/паузу фоновой индексации
 * - Отслеживание изменений файлов (FileSystemWatcher)
 * - Отправку прогресса в webview
 * - Предоставление API для поиска
 */
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import * as vscode from "vscode"
import type { IndexingConfig, IndexingMode, IndexingProgress, CodeChunk, IndexSearchResult, LocalModelId } from "@shared/IndexingTypes"
import { DEFAULT_INDEXING_CONFIG, DEFAULT_INDEXING_PROGRESS } from "@shared/IndexingTypes"
import { getModelMeta } from "./models/EmbeddingModelRegistry"
import { walkFiles } from "./FileWalker"
import { chunkFile, setTreeSitterWasmDir } from "./CodeChunker"
import { createEmbeddingProvider } from "./EmbeddingRouter"
import type { EmbeddingProvider, ChunkRow } from "./types"
import { IndexStorage } from "./storage/IndexStorage"
import { vectorSearch } from "./storage/VectorSearch"

/** Batch size for embedding requests */
const EMBED_BATCH_SIZE = 32

/** Delay between batches to not hog CPU (ms) */
const BATCH_DELAY_MS = 50
/** Debounce for file watcher change bursts (ms) */
const FILE_CHANGE_DEBOUNCE_MS = 700
/** Resolve current embedding model HuggingFace ID from config */
function getCurrentEmbeddingModel(config: IndexingConfig): string {
	if (config.mode === "local") {
		return getModelMeta(config.localModel || "mini").huggingFaceId
	}
	return config.remoteModel || "text-embedding-3-small"
}

export class IndexingService implements vscode.Disposable {
	private readonly storage: IndexStorage
	private provider: EmbeddingProvider | null = null
	private config: IndexingConfig
	private progress: IndexingProgress = { ...DEFAULT_INDEXING_PROGRESS }
	private watcher: vscode.FileSystemWatcher | null = null
	private cancellation: vscode.CancellationTokenSource | null = null
	private paused = false
	private disposables: vscode.Disposable[] = []
	private readonly pendingFileChangeTimers = new Map<string, NodeJS.Timeout>()

	/** Event emitter for progress updates */
	private readonly _onProgress = new vscode.EventEmitter<IndexingProgress>()
	readonly onProgressChanged: vscode.Event<IndexingProgress> = this._onProgress.event

	private enrichChunkContent(content: string, filePath: string, language: string): string {
		return `// File: ${filePath}\n// Language: ${language}\n${content}`
	}

	constructor(
		private readonly workspacePath: string,
		private readonly extensionPath: string,
		private readonly context?: vscode.ExtensionContext,
	) {
		this.storage = new IndexStorage(workspacePath)
		this.config = this.readConfig()

		// Listen for config changes
		const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("skycode.indexing")) {
				this.onConfigChanged()
			}
		})
		this.disposables.push(configWatcher)
	}

	/** Read indexing config from VS Code settings */
	private readConfig(): IndexingConfig {
		const cfg = vscode.workspace.getConfiguration("skycode.indexing")
		const savedMaxFileSize = cfg.get<number | undefined>("maxFileSize")

		// Auto-migrate: if user has old default (100KB), upgrade to new default (512KB)
		// This fixes the issue where large files were silently dropped from search results
		let maxFileSize = cfg.get("maxFileSize", DEFAULT_INDEXING_CONFIG.maxFileSize)
		if (savedMaxFileSize === 102400) {
			maxFileSize = DEFAULT_INDEXING_CONFIG.maxFileSize // Use new value immediately
			void cfg.update("maxFileSize", DEFAULT_INDEXING_CONFIG.maxFileSize, vscode.ConfigurationTarget.Global)
			console.log(`[Skycode Indexing] Auto-upgraded maxFileSize from 100KB to 512KB for better search coverage`)
		}

		return {
			mode: cfg.get<IndexingMode>("mode", DEFAULT_INDEXING_CONFIG.mode),
			localModel: cfg.get<LocalModelId>("localModel", DEFAULT_INDEXING_CONFIG.localModel),
			remoteApiUrl: cfg.get("remoteApiUrl", DEFAULT_INDEXING_CONFIG.remoteApiUrl),
			remoteApiKey: cfg.get("remoteApiKey", DEFAULT_INDEXING_CONFIG.remoteApiKey),
			remoteModel: cfg.get("remoteModel", DEFAULT_INDEXING_CONFIG.remoteModel),
			maxFileSize,
			ignoredPatterns: cfg.get("ignoredPatterns", DEFAULT_INDEXING_CONFIG.ignoredPatterns),
		}
	}

	/** Handle a config change from the webview or VS Code settings */
	async updateConfig(partial: Partial<IndexingConfig>): Promise<void> {
		const cfg = vscode.workspace.getConfiguration("skycode.indexing")
		for (const [key, value] of Object.entries(partial)) {
			if (value !== undefined) {
				await cfg.update(key, value, vscode.ConfigurationTarget.Global)
			}
		}
		// Config will be re-read via onDidChangeConfiguration
	}

	/** React to config changes */
	private onConfigChanged(): void {
		const oldMode = this.config.mode
		const oldLocalModel = this.config.localModel
		this.config = this.readConfig()
		const newMode = this.config.mode

		if (newMode === "off") {
			this.stop()
		} else if (oldMode === "off" && newMode !== "off") {
			void this.clearAndReindex()
		} else if (oldMode !== newMode) {
			void this.clearAndReindex()
		} else if (newMode === "local" && oldLocalModel !== this.config.localModel) {
			void this.clearAndReindex()
		}

		this.emitProgress()
	}

	/** Clear entire index and start fresh indexing */
	private async clearAndReindex(): Promise<void> {
		this.stop()
		await this.storage.clear()
		this.progress = { ...DEFAULT_INDEXING_PROGRESS }
		this.emitProgress()
		await this.startIndexing()
	}

	/** Get current config */
	getConfig(): IndexingConfig {
		return { ...this.config }
	}

	/** Get current progress */
	getProgress(): IndexingProgress {
		return { ...this.progress }
	}

	getStorage(): IndexStorage {
		return this.storage
	}

	/**
	 * Initialize the service: load existing index, start file watcher, begin indexing if needed.
	 */
	async initialize(): Promise<void> {
		if (this.config.mode === "off") {
			return
		}

		// tree-sitter language WASM files are copied to dist at build time.
		setTreeSitterWasmDir(path.join(this.extensionPath, "dist"))

		let loaded = await this.storage.load()

		// Check if model changed — if so, clear index (embeddings are incompatible)
		const currentModel = getCurrentEmbeddingModel(this.config)
		const storedModel = this.storage.getMetadata("embeddingModel")
		if (storedModel && storedModel !== currentModel) {
			console.log(`[Skycode Indexing] Embedding model changed (${storedModel} -> ${currentModel}). Clearing index.`)
			await this.storage.clear()
			loaded = false
		}
		this.storage.setMetadata("embeddingModel", currentModel)
		await this.storage.save()

		// Set up file watcher for incremental updates
		this.setupFileWatcher()

		if (loaded) {
			// Index exists — report completion state
			const stats = this.storage.getStats()
			this.progress = {
				status: "complete",
				phase: "done",
				filesTotal: stats.totalFiles,
				filesIndexed: stats.totalFiles,
				chunksTotal: stats.totalChunks,
				chunksIndexed: stats.totalChunks,
				lastIndexedAt: stats.lastIndexedAt,
			}
			this.emitProgress()

			// Create embedding provider for incremental updates via file watcher
			try {
				this.provider = createEmbeddingProvider(this.config, this.extensionPath)
			} catch (err: any) {
				console.warn("[Skycode Indexing] Provider creation for incremental updates failed:", err.message)
			}
		} else {
			// No existing index — delay indexing to not block extension activation
			setTimeout(() => {
				this.startIndexing().catch((err) => {
					console.warn("[Skycode Indexing] Background indexing failed:", err)
				})
			}, 5000)
		}
	}

	/** Set up FileSystemWatcher for incremental updates */
	private setupFileWatcher(): void {
		if (this.watcher) {
			this.watcher.dispose()
		}

		const pattern = new vscode.RelativePattern(this.workspacePath, "**/*")
		this.watcher = vscode.workspace.createFileSystemWatcher(pattern)

		this.watcher.onDidChange((uri) => this.scheduleFileChange(uri))
		this.watcher.onDidCreate((uri) => this.scheduleFileChange(uri))
		this.watcher.onDidDelete((uri) => this.onFileDeleted(uri))

		this.disposables.push(this.watcher)
	}

	/** Debounce change/create events to avoid re-indexing on rapid save bursts */
	private scheduleFileChange(uri: vscode.Uri): void {
		const filePath = uri.fsPath
		const existing = this.pendingFileChangeTimers.get(filePath)
		if (existing) {
			clearTimeout(existing)
		}

		const timer = setTimeout(() => {
			this.pendingFileChangeTimers.delete(filePath)
			void this.onFileChanged(uri)
		}, FILE_CHANGE_DEBOUNCE_MS)
		this.pendingFileChangeTimers.set(filePath, timer)
	}

	/** Handle file change/create — re-index this file */
	private async onFileChanged(uri: vscode.Uri): Promise<void> {
		if (this.config.mode === "off" || !this.provider) return

		const filePath = uri.fsPath
		const relPath = vscode.workspace.asRelativePath(filePath)

		// Check if file should be ignored
		const shouldIgnore = this.config.ignoredPatterns.some((pattern) => {
			if (pattern.startsWith("*.")) return filePath.endsWith(pattern.slice(1))
			return relPath.split(/[/\\]/).some((seg) => seg === pattern)
		})
		if (shouldIgnore) return

		try {
			const content = await fs.promises.readFile(filePath, "utf-8")
			const hash = crypto.createHash("md5").update(content).digest("hex")

			if (!this.storage.isFileChanged(relPath, hash)) return

			// Remove old chunks for this file
			this.storage.removeFile(relPath)

			// Chunk and embed
			const chunks = await chunkFile(relPath, content)
			if (chunks.length === 0) return
			for (const chunk of chunks) {
				chunk.content = this.enrichChunkContent(chunk.content, chunk.filePath, chunk.language)
			}

			const texts = chunks.map((c) => c.content)
			const embeddings = await this.provider.embed(texts, "passage")

			const rows: ChunkRow[] = chunks.map((c) => ({
				id: c.id,
				filePath: c.filePath,
				content: c.content,
				startLine: c.startLine,
				endLine: c.endLine,
				language: c.language,
				vectorOffset: 0, // will be set by addChunks
				fileHash: hash,
			}))

			this.storage.addChunks(rows, embeddings)
			await this.storage.finalize()
		} catch {
			// File might be binary, too large, or deleted
		}
	}

	/** Handle file deletion — remove from index */
	private onFileDeleted(uri: vscode.Uri): void {
		const pendingTimer = this.pendingFileChangeTimers.get(uri.fsPath)
		if (pendingTimer) {
			clearTimeout(pendingTimer)
			this.pendingFileChangeTimers.delete(uri.fsPath)
		}

		const relPath = vscode.workspace.asRelativePath(uri.fsPath)
		this.storage.removeFile(relPath)
		// Save async, don't block
		void this.storage.finalize()
	}

	/**
	 * Start a full re-indexing of the workspace.
	 */
	async startIndexing(): Promise<void> {
		// Cancel any running indexing
		this.stop()

		if (this.config.mode === "off") return

		// Create embedding provider
		console.log("[Skycode Indexing] Starting indexing, mode:", this.config.mode, "extensionPath:", this.extensionPath)
		try {
			this.provider = createEmbeddingProvider(this.config, this.extensionPath)
			console.log("[Skycode Indexing] Provider created:", this.provider?.id)
		} catch (err: any) {
			console.error("[Skycode Indexing] Provider creation failed:", err)
			this.progress = {
				...DEFAULT_INDEXING_PROGRESS,
				status: "error",
				errorMessage: err.message,
			}
			this.emitProgress()
			return
		}

		if (!this.provider) return

		this.cancellation = new vscode.CancellationTokenSource()
		const token = this.cancellation.token

		this.progress = {
			status: "indexing",
			phase: "walking",
			filesTotal: 0,
			filesIndexed: 0,
			chunksTotal: 0,
			chunksIndexed: 0,
		}
		this.emitProgress()

		try {
			// Phase 1: Walk and count files (yield every 100 files to not block event loop)
			console.log("[Skycode Indexing] Phase 1: Walking files in", this.workspacePath)
			const files: Array<{ absPath: string; relPath: string }> = []
			let walkCount = 0
			for await (const file of walkFiles(this.workspacePath, this.config, token)) {
				if (token.isCancellationRequested) return
				files.push(file)
				walkCount++
				if (walkCount % 100 === 0) {
					await new Promise((r) => setTimeout(r, 1))
				}
			}

			this.progress.filesTotal = files.length
			this.progress.phase = "chunking"
			this.emitProgress()
			console.log("[Skycode Indexing] Phase 1 done:", files.length, "files found")

			// Phase 2: Initialize storage
			this.storage.beginIndexing(this.provider.id, this.provider.dimensions)
			this.storage.setMetadata("embeddingModel", getCurrentEmbeddingModel(this.config))

			// Phase 3: Chunk all files
			const allChunks: Array<{ chunk: CodeChunk; fileHash: string }> = []

			for (let i = 0; i < files.length; i++) {
				if (token.isCancellationRequested) return
				while (this.paused) {
					await new Promise((r) => setTimeout(r, 200))
					if (token.isCancellationRequested) return
				}

				const file = files[i]
				this.progress.currentFile = file.relPath
				this.progress.filesIndexed = i

				try {
					const content = await fs.promises.readFile(file.absPath, "utf-8")
					const hash = crypto.createHash("md5").update(content).digest("hex")
					const chunks = await chunkFile(file.relPath, content)
					for (const chunk of chunks) {
						chunk.content = this.enrichChunkContent(chunk.content, chunk.filePath, chunk.language)
						allChunks.push({ chunk, fileHash: hash })
					}
				} catch {
					// Skip unreadable files
				}

				// Emit progress and yield every 20 files
				if (i % 20 === 0) {
					this.progress.chunksTotal = allChunks.length
					this.emitProgress()
					await new Promise((r) => setTimeout(r, 1))
				}
			}

			this.progress.filesIndexed = files.length
			this.progress.chunksTotal = allChunks.length
			this.progress.phase = "loading_model"
			this.emitProgress()

			// Phase 4: Embed in batches
			console.log("[Skycode Indexing] Phase 4: Embedding", allChunks.length, "chunks in batches of", EMBED_BATCH_SIZE)
			for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
				if (token.isCancellationRequested) return
				while (this.paused) {
					await new Promise((r) => setTimeout(r, 200))
					if (token.isCancellationRequested) return
				}

				const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE)
				const texts = batch.map((b) => b.chunk.content)

				let embeddings: number[][]
				try {
					embeddings = await this.provider.embed(texts, "passage")
				} catch (err: any) {
					console.error("[Skycode Indexing] Embedding error at batch", i, ":", err)
					// Don't fail entire indexing - skip this batch and continue
					console.warn(`[Skycode Indexing] Skipping batch ${i} (${batch.length} chunks) due to embedding error`)
					continue
				}

				// Filter out chunks that failed to embed (zero vectors)
				const validPairs: Array<{ chunk: ChunkRow; embedding: number[] }> = []
				for (let j = 0; j < batch.length; j++) {
					const embedding = embeddings[j]
					// Check if embedding is all zeros (indicates skipped/failed chunk)
					const isZeroVector = embedding?.every((v) => v === 0) ?? false
					if (embedding && !isZeroVector) {
						validPairs.push({
							chunk: {
								id: batch[j].chunk.id,
								filePath: batch[j].chunk.filePath,
								content: batch[j].chunk.content,
								startLine: batch[j].chunk.startLine,
								endLine: batch[j].chunk.endLine,
								language: batch[j].chunk.language,
								vectorOffset: 0,
								fileHash: batch[j].fileHash,
							},
							embedding,
						})
					} else {
						console.warn(
							`[Skycode Indexing] Skipping chunk ${batch[j].chunk.filePath}:${batch[j].chunk.startLine} (embedding failed or too large)`,
						)
					}
				}

				if (validPairs.length > 0) {
					const rows = validPairs.map((p) => p.chunk)
					const validEmbeddings = validPairs.map((p) => p.embedding)
					this.storage.addChunks(rows, validEmbeddings)
				}

				this.progress.chunksIndexed = Math.min(i + EMBED_BATCH_SIZE, allChunks.length)
				if (this.progress.phase === "loading_model") {
					this.progress.phase = "embedding"
				}
				this.emitProgress()

				// Yield to event loop
				await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
			}

			// Phase 5: Finalize
			this.progress.phase = "saving"
			this.emitProgress()
			await this.storage.finalize()

			const stats = this.storage.getStats()
			this.progress = {
				status: "complete",
				phase: "done",
				filesTotal: files.length,
				filesIndexed: files.length,
				chunksTotal: allChunks.length,
				chunksIndexed: allChunks.length,
				lastIndexedAt: stats.lastIndexedAt,
			}
			this.emitProgress()

			// Re-setup file watcher for incremental updates
			this.setupFileWatcher()
		} catch (err: any) {
			console.error("[Skycode Indexing] Indexing failed:", err)
			if (!token.isCancellationRequested) {
				this.progress = {
					...this.progress,
					status: "error",
					errorMessage: err.message,
				}
				this.emitProgress()
			}
		}
	}

	/** Pause indexing */
	pause(): void {
		if (this.progress.status === "indexing") {
			this.paused = true
			this.progress.status = "paused"
			this.emitProgress()
		}
	}

	/** Resume indexing */
	resume(): void {
		if (this.paused) {
			this.paused = false
			this.progress.status = "indexing"
			this.emitProgress()
		}
	}

	/** Stop indexing completely */
	stop(): void {
		this.paused = false
		if (this.cancellation) {
			this.cancellation.cancel()
			this.cancellation.dispose()
			this.cancellation = null
		}
		if (this.provider) {
			this.provider.dispose()
			this.provider = null
		}
	}

	/** Clear the entire index */
	async clearIndex(): Promise<void> {
		this.stop()
		await this.storage.clear()
		this.progress = { ...DEFAULT_INDEXING_PROGRESS }
		this.emitProgress()
	}

	/**
	 * Search the index with a text query.
	 * The query is embedded using the current provider, then compared against all chunks.
	 */
	async search(query: string, topK: number = 10): Promise<IndexSearchResult[]> {
		if (this.config.mode === "off") {
			console.log("[Skycode Search] Aborted: mode is off")
			return []
		}

		if (!this.provider) {
			try {
				this.provider = createEmbeddingProvider(this.config, this.extensionPath)
			} catch (err) {
				console.warn("[Skycode Search] Provider creation failed:", err)
				return []
			}
		}
		if (!this.provider) {
			console.log("[Skycode Search] Aborted: provider is null after creation")
			return []
		}

		if (this.storage.getChunks().length === 0) {
			await this.storage.load()
		}
		const chunkCount = this.storage.getChunks().length
		if (chunkCount === 0) {
			console.log("[Skycode Search] Aborted: 0 chunks in storage after load")
			return []
		}

		let queryVec: number[]
		try {
			const embedResult = await this.provider.embed([query], "query")
			queryVec = embedResult[0]
		} catch (err) {
			console.warn("[Skycode Search] Query embedding failed:", err)
			return []
		}
		if (!queryVec) {
			console.log("[Skycode Search] Aborted: queryVec is null/undefined")
			return []
		}

		console.log(`[Skycode Search] vectorSearch: chunks=${chunkCount} dims=${this.storage.getDimensions()} queryVecLen=${queryVec.length}`)
		const results = vectorSearch(this.storage, queryVec, topK)
		console.log(`[Skycode Search] vectorSearch returned ${results.length} results`)
		return results
	}

	/**
	 * Handle a command from the webview or command palette.
	 */
	async handleCommand(command: "reindex" | "clear" | "pause" | "resume"): Promise<void> {
		switch (command) {
			case "reindex":
				await this.clearAndReindex()
				break
			case "clear":
				await this.clearIndex()
				break
			case "pause":
				this.pause()
				break
			case "resume":
				this.resume()
				break
		}
	}

	/** Emit current progress to listeners */
	private emitProgress(): void {
		this._onProgress.fire({ ...this.progress })
	}

	dispose(): void {
		this.stop()
		for (const timer of this.pendingFileChangeTimers.values()) {
			clearTimeout(timer)
		}
		this.pendingFileChangeTimers.clear()
		this._onProgress.dispose()
		for (const d of this.disposables) {
			d.dispose()
		}
		this.disposables = []
	}
}
