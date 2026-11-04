import { ensureMemoryDirectoryExists } from "@core/storage/disk"
import { createHash } from "crypto"
import fs from "fs/promises"
import * as path from "path"
import { Logger } from "@/shared/services/Logger"
import {
	applyEdit,
	applyForget,
	applyRemember,
	applyRestore,
	EMPTY_MEMORY_BLOCK,
	emptyMemoryFile,
	type MemoryEntry,
	type MemoryFile,
	type MemoryScope,
	noteTaskStarted,
	parseMemoryFile,
	type RememberInput,
	type RememberResult,
	renderMemoryForPrompt,
	scopeOfType,
} from "./memory"

export const GLOBAL_MEMORY_FILE = "global.json"
export const PROJECTS_DIR = "projects"
/** Файл первой версии (одна память на всё); переносится в global.json и projects/ при первом чтении */
const LEGACY_MEMORY_FILE = "memory.json"

function normalizeWorkspace(cwd: string): string {
	return path.resolve(cwd).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
}

/** Имя файла памяти проекта: имя папки (чтобы было понятно руками) + хеш пути (чтобы не путать одноимённые). */
export function projectMemoryFileName(cwd: string): string {
	const base =
		path
			.basename(path.resolve(cwd))
			.replace(/[^\p{L}\p{N}._-]+/gu, "_")
			.slice(0, 40) || "project"
	const hash = createHash("sha1").update(normalizeWorkspace(cwd)).digest("hex").slice(0, 8)
	return `${base}-${hash}.json`
}

/**
 * [SKYCODE] Файлы памяти: общая (global.json) и по проектам (projects/<папка>-<хеш>.json).
 * Общие для всех вкладок и окон. Записи идут строго по очереди (вкладки работают параллельно),
 * перед каждой операцией файл перечитывается, если его поменяли руками или из другого окна.
 * Ошибки диска не роняют задачу: память просто недоступна.
 */
export class MemoryStore {
	private static instance: MemoryStore | undefined

	static get(): MemoryStore {
		MemoryStore.instance ??= new MemoryStore()
		return MemoryStore.instance
	}

	/** Для тестов: хранилище в заданной папке. */
	static forDirectory(dir: string): MemoryStore {
		return new MemoryStore(dir)
	}

	private readonly cache = new Map<string, { mtimeMs: number; file: MemoryFile }>()
	private queue: Promise<unknown> = Promise.resolve()
	private readonly writesByTask = new Map<string, number>()
	private migrated: Promise<void> | undefined

	private constructor(private readonly dirOverride?: string) {}

	private async dir(): Promise<string> {
		if (this.dirOverride) {
			await fs.mkdir(this.dirOverride, { recursive: true })
			return this.dirOverride
		}
		return ensureMemoryDirectoryExists()
	}

	async globalPath(): Promise<string> {
		return path.join(await this.dir(), GLOBAL_MEMORY_FILE)
	}

	async projectPath(cwd: string): Promise<string> {
		return path.join(await this.dir(), PROJECTS_DIR, projectMemoryFileName(cwd))
	}

	private pathForScope(scope: MemoryScope, cwd: string): Promise<string> {
		return scope === "project" ? this.projectPath(cwd) : this.globalPath()
	}

	/** Создаёт пустые файлы, если их нет, — чтобы кнопке «Открыть память» было что открыть. */
	async ensureFiles(cwd?: string): Promise<string[]> {
		await this.migrate()
		const targets: { filePath: string; workspace?: string }[] = [{ filePath: await this.globalPath() }]
		if (cwd) {
			targets.push({ filePath: await this.projectPath(cwd), workspace: cwd })
		}
		for (const { filePath, workspace } of targets) {
			try {
				await fs.access(filePath)
			} catch {
				await this.write(filePath, emptyMemoryFile(workspace))
			}
		}
		return targets.map((t) => t.filePath)
	}

	/**
	 * Первая версия хранила всё в memory.json с полем scope ("global" или путь папки).
	 * Раскладываем по новым файлам один раз, старый файл оставляем рядом как memory.json.migrated.
	 */
	private migrate(): Promise<void> {
		this.migrated ??= (async () => {
			const legacy = path.join(await this.dir(), LEGACY_MEMORY_FILE)
			let raw: string
			try {
				raw = await fs.readFile(legacy, "utf8")
			} catch {
				return
			}
			try {
				const scopes = new Map<string, string>()
				try {
					for (const e of (JSON.parse(raw) as { entries?: { id?: string; scope?: string }[] }).entries ?? []) {
						if (typeof e?.id === "string" && typeof e.scope === "string") {
							scopes.set(e.id, e.scope)
						}
					}
				} catch {
					// битый файл — переносить нечего
				}
				const groups = new Map<string, { workspace?: string; entries: MemoryEntry[] }>()
				for (const entry of parseMemoryFile(raw).entries) {
					const scope = scopes.get(entry.id) ?? "global"
					const isGlobal = scope === "global"
					const target = isGlobal ? await this.globalPath() : await this.projectPath(scope)
					const group = groups.get(target) ?? { workspace: isGlobal ? undefined : scope, entries: [] }
					group.entries.push(entry)
					groups.set(target, group)
				}
				for (const [target, group] of groups) {
					const file = await this.load(target)
					const known = new Set(file.entries.map((e) => e.id))
					const merged: MemoryFile = {
						...file,
						entries: [...file.entries, ...group.entries.filter((e) => !known.has(e.id))],
					}
					if (group.workspace && !merged.workspace) {
						merged.workspace = group.workspace
					}
					await this.write(target, merged)
				}
				await fs.rename(legacy, `${legacy}.migrated`)
			} catch (error) {
				Logger.error("[Memory] migration of memory.json failed", error)
			}
		})()
		return this.migrated
	}

	private async load(filePath: string): Promise<MemoryFile> {
		try {
			const stat = await fs.stat(filePath)
			const cached = this.cache.get(filePath)
			if (cached && cached.mtimeMs === stat.mtimeMs) {
				return cached.file
			}
			const file = parseMemoryFile(await fs.readFile(filePath, "utf8"))
			this.cache.set(filePath, { mtimeMs: stat.mtimeMs, file })
			return file
		} catch {
			this.cache.delete(filePath)
			return emptyMemoryFile()
		}
	}

	private async write(filePath: string, file: MemoryFile): Promise<void> {
		await fs.mkdir(path.dirname(filePath), { recursive: true })
		const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
		try {
			await fs.writeFile(tmp, `${JSON.stringify(file, null, "\t")}\n`, "utf8")
			await fs.rename(tmp, filePath)
		} catch (error) {
			fs.unlink(tmp).catch(() => {})
			throw error
		}
		try {
			this.cache.set(filePath, { mtimeMs: (await fs.stat(filePath)).mtimeMs, file })
		} catch {
			this.cache.delete(filePath)
		}
	}

	private serialize<T>(op: () => Promise<T>): Promise<T> {
		const run = this.queue.then(op, op)
		this.queue = run.catch(() => {})
		return run
	}

	async renderForPrompt(cwd: string): Promise<string> {
		try {
			await this.migrate()
			const global = await this.load(await this.globalPath())
			const project = await this.load(await this.projectPath(cwd))
			return renderMemoryForPrompt(global, project) || EMPTY_MEMORY_BLOCK
		} catch (error) {
			Logger.error("[Memory] render failed", error)
			return ""
		}
	}

	/** Все записи обеих памятей для данной папки. */
	async list(cwd: string): Promise<{ global: MemoryEntry[]; project: MemoryEntry[] }> {
		await this.migrate()
		const global = await this.load(await this.globalPath())
		const project = await this.load(await this.projectPath(cwd))
		return { global: global.entries, project: project.entries }
	}

	/** Отмечает начало задачи: пробные записи из других задач делают шаг к подтверждению. */
	noteTaskStarted(taskId: string, cwd: string): Promise<void> {
		return this.serialize(async () => {
			try {
				await this.migrate()
				for (const filePath of [await this.globalPath(), await this.projectPath(cwd)]) {
					const next = noteTaskStarted(await this.load(filePath), taskId)
					if (next) {
						await this.write(filePath, next)
					}
				}
			} catch (error) {
				Logger.error("[Memory] noteTaskStarted failed", error)
			}
		})
	}

	remember(input: RememberInput, ctx: { taskId: string; cwd: string; userTexts: string[] }): Promise<RememberResult> {
		return this.serialize(async () => {
			await this.migrate()
			// Куда писать, решает тип; неизвестный тип отсечёт applyRemember, файл при этом не тронется.
			const scope: MemoryScope = input.type?.trim().toLowerCase() === "project" ? "project" : "global"
			const filePath = await this.pathForScope(scope, ctx.cwd)
			let file = await this.load(filePath)
			if (scope === "project" && !file.workspace) {
				file = { ...file, workspace: ctx.cwd }
			}
			const result = applyRemember(file, input, { ...ctx, writesInTask: this.writesByTask.get(ctx.taskId) ?? 0 })
			if (result.ok) {
				await this.write(filePath, result.file)
				this.writesByTask.set(ctx.taskId, (this.writesByTask.get(ctx.taskId) ?? 0) + 1)
			}
			return result
		})
	}

	/** Отмена обновления: вернуть запись к прежнему тексту. */
	restore(previous: MemoryEntry, cwd: string): Promise<void> {
		return this.serialize(async () => {
			const filePath = await this.pathForScope(scopeOfType(previous.type), cwd)
			await this.write(filePath, applyRestore(await this.load(filePath), previous))
		})
	}

	/** Удаляет запись по id из общей памяти или памяти проекта — где найдётся. */
	forget(id: string, cwd: string): Promise<MemoryEntry | undefined> {
		return this.serialize(async () => {
			await this.migrate()
			for (const filePath of [await this.globalPath(), await this.projectPath(cwd)]) {
				const { file: next, removed } = applyForget(await this.load(filePath), id)
				if (removed) {
					await this.write(filePath, next)
					return removed
				}
			}
			return undefined
		})
	}

	/** Правка текста записи пользователем; ищет запись в обеих памятях. */
	edit(id: string, text: string, cwd: string): Promise<{ ok: true; entry: MemoryEntry } | { ok: false; reason: string }> {
		return this.serialize(async () => {
			await this.migrate()
			for (const filePath of [await this.globalPath(), await this.projectPath(cwd)]) {
				const file = await this.load(filePath)
				if (!file.entries.some((e) => e.id === id)) {
					continue
				}
				const result = applyEdit(file, id, text)
				if (result.ok) {
					await this.write(filePath, result.file)
					return { ok: true as const, entry: result.entry }
				}
				return result
			}
			return { ok: false as const, reason: "not found" }
		})
	}
}
