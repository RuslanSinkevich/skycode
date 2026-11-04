import { ensureMemoryDirectoryExists } from "@core/storage/disk"
import fs from "fs/promises"
import * as path from "path"
import { Logger } from "@/shared/services/Logger"
import {
	applyForget,
	applyRemember,
	applyRestore,
	EMPTY_MEMORY_BLOCK,
	emptyMemoryFile,
	type MemoryEntry,
	type MemoryFile,
	noteTaskStarted,
	parseMemoryFile,
	type RememberInput,
	type RememberResult,
	renderMemoryForPrompt,
} from "./memory"

export const MEMORY_FILE_NAME = "memory.json"

/**
 * [SKYCODE] Файл памяти, общий для всех вкладок и окон. Записи идут строго по очереди (вкладки
 * работают параллельно), перед каждой операцией файл перечитывается, если его поменяли руками
 * или из другого окна. Ошибки диска не роняют задачу: память просто недоступна.
 */
export class MemoryStore {
	private static instance: MemoryStore | undefined

	static get(): MemoryStore {
		MemoryStore.instance ??= new MemoryStore()
		return MemoryStore.instance
	}

	private cache: MemoryFile = emptyMemoryFile()
	private cacheMtimeMs = -1
	private queue: Promise<unknown> = Promise.resolve()
	private readonly writesByTask = new Map<string, number>()

	private constructor(private readonly dirOverride?: string) {}

	/** Для тестов: хранилище в заданной папке. */
	static forDirectory(dir: string): MemoryStore {
		return new MemoryStore(dir)
	}

	async getFilePath(): Promise<string> {
		const dir = this.dirOverride ?? (await ensureMemoryDirectoryExists())
		if (this.dirOverride) {
			await fs.mkdir(dir, { recursive: true })
		}
		return path.join(dir, MEMORY_FILE_NAME)
	}

	/** Создаёт пустой файл, если его нет, — чтобы кнопке «Открыть» было что открыть. */
	async ensureFile(): Promise<string> {
		const filePath = await this.getFilePath()
		try {
			await fs.access(filePath)
		} catch {
			await this.write(filePath, emptyMemoryFile())
		}
		return filePath
	}

	private async load(): Promise<{ filePath: string; file: MemoryFile }> {
		const filePath = await this.getFilePath()
		try {
			const stat = await fs.stat(filePath)
			if (stat.mtimeMs !== this.cacheMtimeMs) {
				this.cache = parseMemoryFile(await fs.readFile(filePath, "utf8"))
				this.cacheMtimeMs = stat.mtimeMs
			}
		} catch {
			this.cache = emptyMemoryFile()
			this.cacheMtimeMs = -1
		}
		return { filePath, file: this.cache }
	}

	private async write(filePath: string, file: MemoryFile): Promise<void> {
		const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
		try {
			await fs.writeFile(tmp, `${JSON.stringify(file, null, "\t")}\n`, "utf8")
			await fs.rename(tmp, filePath)
		} catch (error) {
			fs.unlink(tmp).catch(() => {})
			throw error
		}
		this.cache = file
		try {
			this.cacheMtimeMs = (await fs.stat(filePath)).mtimeMs
		} catch {
			this.cacheMtimeMs = -1
		}
	}

	private serialize<T>(op: () => Promise<T>): Promise<T> {
		const run = this.queue.then(op, op)
		this.queue = run.catch(() => {})
		return run
	}

	async renderForPrompt(cwd: string): Promise<string> {
		try {
			const { file } = await this.load()
			return renderMemoryForPrompt(file, cwd) || EMPTY_MEMORY_BLOCK
		} catch (error) {
			Logger.error("[Memory] render failed", error)
			return ""
		}
	}

	async list(): Promise<MemoryEntry[]> {
		const { file } = await this.load()
		return file.entries
	}

	/** Отмечает начало задачи: пробные записи из других задач делают шаг к подтверждению. */
	noteTaskStarted(taskId: string): Promise<void> {
		return this.serialize(async () => {
			try {
				const { filePath, file } = await this.load()
				const next = noteTaskStarted(file, taskId)
				if (next) {
					await this.write(filePath, next)
				}
			} catch (error) {
				Logger.error("[Memory] noteTaskStarted failed", error)
			}
		})
	}

	remember(input: RememberInput, ctx: { taskId: string; cwd: string; userTexts: string[] }): Promise<RememberResult> {
		return this.serialize(async () => {
			const { filePath, file } = await this.load()
			const result = applyRemember(file, input, { ...ctx, writesInTask: this.writesByTask.get(ctx.taskId) ?? 0 })
			if (result.ok) {
				await this.write(filePath, result.file)
				this.writesByTask.set(ctx.taskId, (this.writesByTask.get(ctx.taskId) ?? 0) + 1)
			}
			return result
		})
	}

	/** Отмена обновления: вернуть запись к прежнему тексту. */
	restore(previous: MemoryEntry): Promise<void> {
		return this.serialize(async () => {
			const { filePath, file } = await this.load()
			await this.write(filePath, applyRestore(file, previous))
		})
	}

	forget(id: string): Promise<MemoryEntry | undefined> {
		return this.serialize(async () => {
			const { filePath, file } = await this.load()
			const { file: next, removed } = applyForget(file, id)
			if (removed) {
				await this.write(filePath, next)
			}
			return removed
		})
	}
}
