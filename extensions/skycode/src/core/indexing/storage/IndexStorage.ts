/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * IndexStorage — SQLite storage for index metadata and chunks.
 *
 * Disk layout:
 *   ~/.skycode/indexing/{workspace-hash}/index.db
 *
 * Chunk vectors are stored in SQLite as BLOBs (Float32Array bytes).
 * At runtime, vectors are loaded into a flat Float32Array cache for fast cosine search.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import * as crypto from "node:crypto"
import * as os from "node:os"
import type { ChunkRow, IndexMetadata } from "../types"

type SqliteDbLike = {
	pragma(sql: string): void
	exec(sql: string): void
	prepare(sql: string): { get(): any; all(): any[]; run(...args: any[]): void }
	transaction<T extends any[]>(fn: (...args: T) => void): (...args: T) => void
	close(): void
}

/** Directory where all indexing data is stored */
function getIndexBaseDir(): string {
	return path.join(os.homedir(), ".skycode", "indexing")
}

/** Create a short hash for the workspace path */
function workspaceHash(workspacePath: string): string {
	return crypto.createHash("sha256").update(workspacePath).digest("hex").slice(0, 16)
}

export class IndexStorage {
	private readonly indexDir: string
	private readonly dbPath: string
	private readonly jsonMetaPath: string
	private readonly jsonChunksPath: string
	private readonly jsonVectorsPath: string
	private db: SqliteDbLike | null = null
	private backend: "sqlite" | "json" = "sqlite"
	private backendWarningLogged = false
	private backendInfoLogged = false
	private lastFinalizeLogAt = 0
	private lastFinalizeLoggedChunks = -1
	private chunks: ChunkRow[] = []
	private vectors: Float32Array = new Float32Array(0)
	/** Logical number of floats used in `vectors` (actual capacity may be larger). */
	private vectorsLength = 0
	private metadata: IndexMetadata | null = null
	private metadataStore = new Map<string, string>()
	private dimensions: number = 0
	/** Fast lookup: filePath → fileHash from the last observed chunk of that file. */
	private fileHashIndex = new Map<string, string>()
	/** Fast lookup: filePath → all chunk indices in `chunks` array (for O(1) removal). */
	private fileChunkIndex = new Map<string, Set<number>>()

	constructor(workspacePath: string) {
		const hash = workspaceHash(workspacePath)
		this.indexDir = path.join(getIndexBaseDir(), hash)
		this.dbPath = path.join(this.indexDir, "index.db")
		this.jsonMetaPath = path.join(this.indexDir, "index.json")
		this.jsonChunksPath = path.join(this.indexDir, "chunks.json")
		this.jsonVectorsPath = path.join(this.indexDir, "vectors.bin")
	}

	private async ensureDir(): Promise<void> {
		await fs.promises.mkdir(this.indexDir, { recursive: true })
	}

	private openDb(): boolean {
		if (this.db) {
			return true
		}
		try {
			const Database = require("better-sqlite3")
			// Resolve native binding path explicitly to avoid `bindings` lookup failures
			// in Electron/VS Code extension host environment.
			const betterSqlite3Dir = path.dirname(require.resolve("better-sqlite3/package.json"))
			const nativeBindingPath = path.join(
				betterSqlite3Dir,
				"build",
				"Release",
				"better_sqlite3.node",
			)
			this.db = new Database(this.dbPath, { nativeBinding: nativeBindingPath })
			;(this.db as any).pragma("journal_mode = WAL")
			;(this.db as any).pragma("synchronous = NORMAL")
			this.createTables()
			this.backend = "sqlite"
			if (!this.backendInfoLogged) {
				console.log("[Skycode Indexing] Storage backend: sqlite")
				this.backendInfoLogged = true
			}
			return true
		} catch (error) {
			this.db = null
			this.backend = "json"
			if (!this.backendWarningLogged) {
				console.warn("[Skycode Indexing] SQLite unavailable, fallback to JSON storage:", error)
				this.backendWarningLogged = true
			}
			if (!this.backendInfoLogged) {
				console.log("[Skycode Indexing] Storage backend: json")
				this.backendInfoLogged = true
			}
			return false
		}
	}

	private createTables(): void {
		;(this.db as any).exec(`
			CREATE TABLE IF NOT EXISTS metadata (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				embedding_provider_id TEXT NOT NULL,
				dimensions INTEGER NOT NULL,
				last_indexed_at INTEGER NOT NULL DEFAULT 0,
				total_chunks INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE IF NOT EXISTS metadata_store (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS chunks (
				id TEXT PRIMARY KEY,
				file_path TEXT NOT NULL,
				content TEXT NOT NULL,
				start_line INTEGER NOT NULL,
				end_line INTEGER NOT NULL,
				language TEXT NOT NULL,
				file_hash TEXT NOT NULL,
				vector BLOB NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
			CREATE INDEX IF NOT EXISTS idx_chunks_file_hash ON chunks(file_path, file_hash);
		`)
	}

	private resetInMemory(): void {
		this.chunks = []
		this.vectors = new Float32Array(0)
		this.vectorsLength = 0
		this.metadata = null
		this.metadataStore.clear()
		this.dimensions = 0
		this.fileHashIndex.clear()
		this.fileChunkIndex.clear()
	}

	/** Grow `this.vectors` to at least `minCapacity` floats, doubling when needed. */
	private ensureVectorCapacity(minCapacity: number): void {
		if (this.vectors.length >= minCapacity) return
		let newCapacity = this.vectors.length > 0 ? this.vectors.length : 1024 * this.dimensions
		while (newCapacity < minCapacity) {
			newCapacity *= 2
		}
		const grown = new Float32Array(newCapacity)
		grown.set(this.vectors.subarray(0, this.vectorsLength))
		this.vectors = grown
	}

	/** Register a chunk in the per-file indices (used for O(1) isFileChanged/removeFile). */
	private indexChunk(chunk: ChunkRow, chunkIdx: number): void {
		this.fileHashIndex.set(chunk.filePath, chunk.fileHash)
		let set = this.fileChunkIndex.get(chunk.filePath)
		if (!set) {
			set = new Set<number>()
			this.fileChunkIndex.set(chunk.filePath, set)
		}
		set.add(chunkIdx)
	}

	/** Rebuild `fileHashIndex` and `fileChunkIndex` from `this.chunks`. */
	private rebuildFileIndex(): void {
		this.fileHashIndex.clear()
		this.fileChunkIndex.clear()
		for (let i = 0; i < this.chunks.length; i++) {
			this.indexChunk(this.chunks[i], i)
		}
	}

	async load(): Promise<boolean> {
		try {
			await this.ensureDir()
			const hasSqlite = fs.existsSync(this.dbPath)
			const hasJson =
				fs.existsSync(this.jsonMetaPath) &&
				fs.existsSync(this.jsonChunksPath) &&
				fs.existsSync(this.jsonVectorsPath)

			if (hasSqlite && this.openDb()) {
				const metaRow = (this.db as any)
					.prepare(
						"SELECT embedding_provider_id, dimensions, last_indexed_at, total_chunks FROM metadata WHERE id = 1",
					)
					.get()
				if (!metaRow) {
					this.resetInMemory()
					return false
				}

				this.metadata = {
					embeddingProviderId: metaRow.embedding_provider_id,
					dimensions: metaRow.dimensions,
					lastIndexedAt: metaRow.last_indexed_at,
					totalChunks: metaRow.total_chunks,
				}
				this.dimensions = metaRow.dimensions

				const metadataRows = (this.db as any).prepare("SELECT key, value FROM metadata_store").all()
				this.metadataStore.clear()
				for (const row of metadataRows) {
					this.metadataStore.set(row.key, row.value)
				}

				const rows = (this.db as any)
					.prepare(
						"SELECT id, file_path, content, start_line, end_line, language, file_hash, vector FROM chunks ORDER BY rowid ASC",
					)
					.all()

				this.chunks = []
				// Pre-allocate once; no per-chunk reallocation.
				const totalFloats = rows.length * this.dimensions
				this.vectors = new Float32Array(totalFloats)
				this.vectorsLength = totalFloats
				let vectorOffset = 0
				for (const row of rows) {
					const vec = new Float32Array(
						row.vector.buffer,
						row.vector.byteOffset,
						row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
					)
					this.vectors.set(vec, vectorOffset)
					this.chunks.push({
						id: row.id,
						filePath: row.file_path,
						content: row.content,
						startLine: row.start_line,
						endLine: row.end_line,
						language: row.language,
						vectorOffset,
						fileHash: row.file_hash,
					})
					vectorOffset += this.dimensions
				}

				this.rebuildFileIndex()
				console.log("[Skycode Indexing] Index loaded from sqlite:", this.chunks.length, "chunks")
				// Empty index is treated as not loaded — triggers re-indexing
				return this.chunks.length > 0
			}

			if (hasJson) {
				this.backend = "json"
				const metaRaw = await fs.promises.readFile(this.jsonMetaPath, "utf-8")
				const chunksRaw = await fs.promises.readFile(this.jsonChunksPath, "utf-8")
				const vectorsBuffer = await fs.promises.readFile(this.jsonVectorsPath)
				const parsedMeta = JSON.parse(metaRaw) as IndexMetadata
				const parsedChunks = JSON.parse(chunksRaw) as ChunkRow[]

				this.metadata = parsedMeta
				this.dimensions = parsedMeta.dimensions
				this.chunks = parsedChunks
				this.metadataStore = new Map<string, string>(Object.entries((parsedMeta as any).metadataStore ?? {}))
				this.vectors = new Float32Array(
					vectorsBuffer.buffer.slice(
						vectorsBuffer.byteOffset,
						vectorsBuffer.byteOffset + vectorsBuffer.byteLength,
					),
				)
				this.vectorsLength = this.vectors.length
				this.rebuildFileIndex()
				console.log("[Skycode Indexing] Index loaded from json:", this.chunks.length, "chunks")
				return this.chunks.length > 0
			}

			this.resetInMemory()
			return false
		} catch {
			this.resetInMemory()
			return false
		}
	}

	async save(): Promise<void> {
		if (!this.metadata) {
			return
		}
		if (this.backend === "sqlite" && this.db) {
			;(this.db as any)
				.prepare(
					`INSERT INTO metadata (id, embedding_provider_id, dimensions, last_indexed_at, total_chunks)
					VALUES (1, ?, ?, ?, ?)
					ON CONFLICT(id) DO UPDATE SET
					embedding_provider_id=excluded.embedding_provider_id,
					dimensions=excluded.dimensions,
					last_indexed_at=excluded.last_indexed_at,
					total_chunks=excluded.total_chunks`,
				)
				.run(
					this.metadata.embeddingProviderId,
					this.metadata.dimensions,
					this.metadata.lastIndexedAt,
					this.metadata.totalChunks,
				)

			const upsertMetadata = (this.db as any).prepare(
				`INSERT INTO metadata_store (key, value)
					VALUES (?, ?)
					ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
			)
			const writeMetadataStore = (this.db as any).transaction((entries: Array<[string, string]>) => {
				for (const [key, value] of entries) {
					upsertMetadata.run(key, value)
				}
			})
			writeMetadataStore(Array.from(this.metadataStore.entries()))
			return
		}
		await this.ensureDir()
		await fs.promises.writeFile(
			this.jsonMetaPath,
			JSON.stringify({
				...this.metadata,
				metadataStore: Object.fromEntries(this.metadataStore.entries()),
			}),
			"utf-8",
		)
		await fs.promises.writeFile(this.jsonChunksPath, JSON.stringify(this.chunks), "utf-8")
		// Write only the used portion of the growable buffer, not any over-allocated tail.
		const used = this.vectors.subarray(0, this.vectorsLength)
		const vectorBuffer = Buffer.from(
			used.buffer,
			used.byteOffset,
			used.byteLength,
		)
		await fs.promises.writeFile(this.jsonVectorsPath, vectorBuffer)
	}

	async clear(): Promise<void> {
		this.resetInMemory()
		if (this.backend === "sqlite" && this.db) {
			try {
				;(this.db as any).close()
			} catch {
				// ignore
			}
			this.db = null
		}

		try {
			await fs.promises.rm(this.indexDir, { recursive: true, force: true })
		} catch {
			// Directory might not exist
		}
	}

	beginIndexing(embeddingProviderId: string, dimensions: number): void {
		fs.mkdirSync(this.indexDir, { recursive: true })
		if (this.openDb()) {
			;(this.db as any).prepare("DELETE FROM chunks").run()
			;(this.db as any).prepare("DELETE FROM metadata").run()
		}

		this.chunks = []
		this.vectors = new Float32Array(0)
		this.vectorsLength = 0
		this.dimensions = dimensions
		this.metadata = {
			embeddingProviderId,
			dimensions,
			lastIndexedAt: 0,
			totalChunks: 0,
		}
		this.metadataStore.clear()
		this.fileHashIndex.clear()
		this.fileChunkIndex.clear()
	}

	addChunks(newChunks: ChunkRow[], newVectors: number[][]): void {
		if (newChunks.length !== newVectors.length) {
			throw new Error("Chunks and vectors arrays must have the same length")
		}
		if (newChunks.length === 0) return

		const startOffset = this.vectorsLength
		if (this.backend === "sqlite" && this.db) {
			const insert = (this.db as any).prepare(
				`INSERT OR REPLACE INTO chunks
					(id, file_path, content, start_line, end_line, language, file_hash, vector)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			const insertMany = (this.db as any).transaction((chunks: ChunkRow[], vectors: number[][]) => {
				for (let i = 0; i < chunks.length; i++) {
					const c = chunks[i]
					const vecArray = new Float32Array(vectors[i])
					const vecBuffer = Buffer.from(
						vecArray.buffer,
						vecArray.byteOffset,
						vecArray.byteLength,
					)
					insert.run(
						c.id,
						c.filePath,
						c.content,
						c.startLine,
						c.endLine,
						c.language,
						c.fileHash,
						vecBuffer,
					)
				}
			})
			insertMany(newChunks, newVectors)
		}

		// Grow the backing buffer ONCE per call (amortized O(1) via doubling capacity).
		// The previous implementation allocated and copied the entire vectors array on
		// every batch, which made full indexing O(N²) in total memcopy bytes.
		const addedFloats = newVectors.length * this.dimensions
		this.ensureVectorCapacity(startOffset + addedFloats)

		for (let i = 0; i < newChunks.length; i++) {
			const offset = startOffset + i * this.dimensions
			this.vectors.set(newVectors[i], offset)
			newChunks[i].vectorOffset = offset
			const chunkIdx = this.chunks.length
			this.chunks.push(newChunks[i])
			this.indexChunk(newChunks[i], chunkIdx)
		}
		this.vectorsLength = startOffset + addedFloats
	}

	async finalize(): Promise<void> {
		if (this.metadata) {
			this.metadata.lastIndexedAt = Date.now()
			this.metadata.totalChunks = this.chunks.length
		}
		await this.save()
		const now = Date.now()
		const chunksChanged = this.lastFinalizeLoggedChunks !== this.chunks.length
		const enoughTimePassed = now - this.lastFinalizeLogAt >= 15000
		if (chunksChanged || enoughTimePassed) {
			console.log("[Skycode Indexing] Index persisted:", this.backend, this.chunks.length, "chunks")
			this.lastFinalizeLogAt = now
			this.lastFinalizeLoggedChunks = this.chunks.length
		}
	}

	removeFile(filePath: string): number {
		if (this.backend === "sqlite" && this.db) {
			;(this.db as any).prepare("DELETE FROM chunks WHERE file_path = ?").run(filePath)
		}

		const indices = this.fileChunkIndex.get(filePath)
		if (!indices || indices.size === 0) {
			return 0
		}

		// Rebuild chunks array without entries for this file. The associated vector
		// slots in `this.vectors` remain allocated but are no longer referenced; they
		// will be garbage-collected on next full reindex. This matches the previous
		// behaviour (no vector removal during incremental updates) while being O(N)
		// instead of a full filter pass per file.
		const toDelete = indices
		const removed = toDelete.size
		const newChunks: ChunkRow[] = []
		for (let i = 0; i < this.chunks.length; i++) {
			if (!toDelete.has(i)) {
				newChunks.push(this.chunks[i])
			}
		}
		this.chunks = newChunks
		this.rebuildFileIndex()
		return removed
	}

	isFileChanged(filePath: string, currentHash: string): boolean {
		const existingHash = this.fileHashIndex.get(filePath)
		if (existingHash === undefined) return true
		return existingHash !== currentHash
	}

	getChunks(): ChunkRow[] {
		return this.chunks
	}

	/**
	 * Return a zero-copy Float32Array view into the underlying buffer.
	 * Callers MUST NOT mutate the returned view — it is shared with the storage.
	 */
	getVector(offset: number): Float32Array {
		return this.vectors.subarray(offset, offset + this.dimensions)
	}

	/** Return a view of only the used portion of the vector buffer (no over-allocated tail). */
	getAllVectors(): Float32Array {
		return this.vectors.subarray(0, this.vectorsLength)
	}

	getDimensions(): number {
		return this.dimensions
	}

	getMetadata(): IndexMetadata | null
	getMetadata(key: string): string | undefined
	getMetadata(key?: string): IndexMetadata | null | string | undefined {
		if (key !== undefined) {
			return this.metadataStore.get(key)
		}
		return this.metadata
	}

	setMetadata(key: string, value: string): void {
		this.metadataStore.set(key, value)
	}

	getStats(): { totalChunks: number; totalFiles: number; lastIndexedAt: number } {
		const uniqueFiles = new Set(this.chunks.map((c) => c.filePath))
		return {
			totalChunks: this.chunks.length,
			totalFiles: uniqueFiles.size,
			lastIndexedAt: this.metadata?.lastIndexedAt ?? 0,
		}
	}
}
