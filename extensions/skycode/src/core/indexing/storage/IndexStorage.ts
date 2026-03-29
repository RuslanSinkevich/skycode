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
	private metadata: IndexMetadata | null = null
	private metadataStore = new Map<string, string>()
	private dimensions: number = 0

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
		this.metadata = null
		this.metadataStore.clear()
		this.dimensions = 0
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
				const vectors: number[] = []
				let vectorOffset = 0
				for (const row of rows) {
					const vec = new Float32Array(
						row.vector.buffer,
						row.vector.byteOffset,
						row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
					)
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
					for (const value of vec) {
						vectors.push(value)
					}
				}

				this.vectors = new Float32Array(vectors)
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
		const vectorBuffer = Buffer.from(
			this.vectors.buffer,
			this.vectors.byteOffset,
			this.vectors.byteLength,
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
		this.dimensions = dimensions
		this.metadata = {
			embeddingProviderId,
			dimensions,
			lastIndexedAt: 0,
			totalChunks: 0,
		}
		this.metadataStore.clear()
	}

	addChunks(newChunks: ChunkRow[], newVectors: number[][]): void {
		if (newChunks.length !== newVectors.length) {
			throw new Error("Chunks and vectors arrays must have the same length")
		}
		if (newChunks.length === 0) return

		const startOffset = this.vectors.length
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

		for (let i = 0; i < newChunks.length; i++) {
			newChunks[i].vectorOffset = startOffset + i * this.dimensions
			this.chunks.push(newChunks[i])
		}

		const flatVectors = new Float32Array(newVectors.length * this.dimensions)
		for (let i = 0; i < newVectors.length; i++) {
			flatVectors.set(newVectors[i], i * this.dimensions)
		}

		const combined = new Float32Array(this.vectors.length + flatVectors.length)
		combined.set(this.vectors)
		combined.set(flatVectors, this.vectors.length)
		this.vectors = combined
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

		const before = this.chunks.length
		this.chunks = this.chunks.filter((c) => c.filePath !== filePath)

		return before - this.chunks.length
	}

	isFileChanged(filePath: string, currentHash: string): boolean {
		const existing = this.chunks.find((c) => c.filePath === filePath)
		if (!existing) return true
		return existing.fileHash !== currentHash
	}

	getChunks(): ChunkRow[] {
		return this.chunks
	}

	getVector(offset: number): Float32Array {
		return this.vectors.slice(offset, offset + this.dimensions)
	}

	getAllVectors(): Float32Array {
		return this.vectors
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
