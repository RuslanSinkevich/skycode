/**
 * [SKYCODE] Карта репозитория: IO-часть (список файлов, разбор, кэш на диске).
 * Логика ранжирования и поиска — в RepoMapIndex.
 *
 *  - список файлов — `rg --files` (уважает .gitignore), без bin/obj/dist/node_modules;
 *  - определения — tree-sitter (уже есть в Skycode) и SQL по `CREATE …`;
 *  - кэш `~/.skycode/repo-map/<hash>.json`: повторный запуск разбирает только
 *    файлы с изменившимися mtime/размером.
 */
import * as childProcess from "node:child_process"
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import * as readline from "node:readline"
import { type LanguageParser, loadRequiredLanguageParsers } from "@services/tree-sitter/languageParser"
import { Logger } from "@/shared/services/Logger"
import { getBinaryLocation } from "@/utils/fs"
import { extractSqlSymbols, symbolsFromCaptures } from "./extractSymbols"
import { type RepoFileEntry, RepoMapIndex, type RepoSymbol } from "./RepoMapIndex"

const CACHE_VERSION = 2
const MAX_FILES = 20000
const MAX_FILE_SIZE = 512 * 1024
/** Не чаще, чем раз в N мс, перепроверять файлы на диске (stat всех файлов). */
const REFRESH_INTERVAL_MS = 10_000
const PARSE_BATCH = 40

const TREE_SITTER_EXTS = [
	"js",
	"jsx",
	"ts",
	"tsx",
	"py",
	"rs",
	"go",
	"c",
	"h",
	"cpp",
	"hpp",
	"cs",
	"rb",
	"java",
	"php",
	"swift",
	"kt",
]
const ALL_EXTS = [...TREE_SITTER_EXTS, "sql"]
/** Сгенерированный код (дизайнеры WinForms/DataSet и т.п.) — тысячи символов шума. */
export const EXCLUDE_GLOBS = [
	"!**/node_modules/**",
	"!**/bin/**",
	"!**/obj/**",
	"!**/dist/**",
	"!**/build/**",
	"!**/out/**",
	"!**/packages/**",
	"!**/*.min.js",
	"!**/*.d.ts",
	"!**/*.[Dd]esigner.cs",
	"!**/*.g.cs",
	"!**/*.g.i.cs",
]

/** Аргументы rg для «исходников проекта» (+ доп. расширения, например разметка). */
export function sourceGlobArgs(extraExts: string[] = []): string[] {
	return [...[...ALL_EXTS, ...extraExts].flatMap((e) => ["-g", `*.${e}`]), ...EXCLUDE_GLOBS.flatMap((g) => ["-g", g])]
}

/**
 * Дополнительные определения C# (штатный запрос — только class/interface/method/namespace).
 * Каждый шаблон проверяется отдельно: если в версии грамматики нет такого узла,
 * шаблон пропускается, а не ломает весь разбор C#.
 */
const CSHARP_EXTRA_PATTERNS = [
	"(struct_declaration name: (identifier) @name.definition.struct) @definition.struct",
	"(enum_declaration name: (identifier) @name.definition.enum) @definition.enum",
	"(record_declaration name: (identifier) @name.definition.record) @definition.record",
	"(constructor_declaration name: (identifier) @name.definition.constructor) @definition.constructor",
	"(property_declaration name: (identifier) @name.definition.property) @definition.property",
]

interface CacheFile {
	version: number
	files: Record<string, RepoFileEntry>
}

function cachePathFor(cwd: string): string {
	const hash = crypto.createHash("sha256").update(path.resolve(cwd).toLowerCase()).digest("hex").slice(0, 16)
	return path.join(os.homedir(), ".skycode", "repo-map", `${hash}.json`)
}

async function listSourceFiles(cwd: string): Promise<string[]> {
	const rg = await getBinaryLocation("rg")
	const args = ["--files", ...sourceGlobArgs()]
	return new Promise((resolve, reject) => {
		const proc = childProcess.spawn(rg, args, { cwd })
		const files: string[] = []
		const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity })
		rl.on("line", (line) => {
			if (files.length < MAX_FILES && line) {
				files.push(line.replace(/\\/g, "/"))
			}
		})
		proc.on("error", reject)
		rl.on("close", () => resolve(files))
	})
}

export function extendCSharpQuery(parsers: LanguageParser): void {
	const cs = parsers.cs
	if (!cs) {
		return
	}
	const language = cs.parser.getLanguage()
	const extras: string[] = []
	for (const pattern of CSHARP_EXTRA_PATTERNS) {
		try {
			language.query(pattern)
			extras.push(pattern)
		} catch {
			// нет такого узла в этой версии грамматики — пропускаем
		}
	}
	if (extras.length === 0) {
		return
	}
	try {
		// Отдельный запрос только с дополнениями; штатный остаётся как есть.
		;(cs as { extraQuery?: unknown }).extraQuery = language.query(extras.join("\n"))
	} catch (error) {
		Logger.warn("[RepoMap] C# extra query failed:", error)
	}
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setImmediate(resolve))
}

export class RepoMap {
	private static readonly instances = new Map<string, RepoMap>()

	static for(cwd: string): RepoMap {
		const key = path.resolve(cwd).toLowerCase()
		let map = RepoMap.instances.get(key)
		if (!map) {
			map = new RepoMap(cwd)
			RepoMap.instances.set(key, map)
		}
		return map
	}

	readonly index = new RepoMapIndex()
	private readonly cachePath: string
	private cacheLoaded = false
	private refreshing: Promise<void> | null = null
	private lastRefreshAt = 0

	private constructor(readonly cwd: string) {
		this.cachePath = cachePathFor(cwd)
	}

	isReady(): boolean {
		return this.index.files.size > 0
	}

	/** Обновить карту, если с прошлой проверки прошло больше REFRESH_INTERVAL_MS. */
	async ensureFresh(): Promise<void> {
		if (this.refreshing) {
			return this.refreshing
		}
		if (this.isReady() && Date.now() - this.lastRefreshAt < REFRESH_INTERVAL_MS) {
			return
		}
		this.refreshing = this.refresh().finally(() => {
			this.refreshing = null
			this.lastRefreshAt = Date.now()
		})
		return this.refreshing
	}

	/**
	 * Обзор для первого сообщения задачи. Не задерживает задачу: ждём обновления
	 * не дольше `waitMs`; если карты ещё нет (первое построение идёт) — null,
	 * построение продолжается в фоне.
	 */
	async overviewForPrompt(maxChars = 6000, waitMs = 3000): Promise<string | null> {
		if (!this.cacheLoaded) {
			this.loadCache()
		}
		const refresh = this.ensureFresh().catch((error) => Logger.warn("[RepoMap] refresh failed:", error))
		const timedOut = await Promise.race([
			refresh.then(() => false),
			new Promise<boolean>((resolve) => setTimeout(() => resolve(true), waitMs).unref?.()),
		])
		if (timedOut && !this.isReady()) {
			return null
		}
		if (!this.isReady()) {
			return null
		}
		// После загрузки кэша ранги могли не считаться (refresh ещё идёт) — пересчитаем.
		this.index.rerank()
		const overview = this.index.renderOverview(maxChars)
		return overview || null
	}

	private loadCache(): void {
		this.cacheLoaded = true
		try {
			const data = JSON.parse(fs.readFileSync(this.cachePath, "utf8")) as CacheFile
			if (data.version !== CACHE_VERSION) {
				return
			}
			for (const [file, entry] of Object.entries(data.files)) {
				this.index.files.set(file, entry)
			}
		} catch {
			// кэша нет или он битый — построим заново
		}
	}

	private saveCache(): void {
		try {
			fs.mkdirSync(path.dirname(this.cachePath), { recursive: true })
			const data: CacheFile = { version: CACHE_VERSION, files: Object.fromEntries(this.index.files) }
			fs.writeFileSync(this.cachePath, JSON.stringify(data))
		} catch (error) {
			Logger.warn("[RepoMap] Failed to save cache:", error)
		}
	}

	private async refresh(): Promise<void> {
		const started = Date.now()
		if (!this.cacheLoaded) {
			this.loadCache()
		}

		const files = await listSourceFiles(this.cwd)
		const present = new Set(files)
		let removed = 0
		for (const file of [...this.index.files.keys()]) {
			if (!present.has(file)) {
				this.index.files.delete(file)
				removed++
			}
		}

		const changed: Array<{ file: string; mtimeMs: number; size: number }> = []
		for (const file of files) {
			try {
				const st = await fs.promises.stat(path.join(this.cwd, file))
				if (st.size > MAX_FILE_SIZE) {
					this.index.files.delete(file)
					continue
				}
				const cached = this.index.files.get(file)
				if (!cached || cached.mtimeMs !== st.mtimeMs || cached.size !== st.size) {
					changed.push({ file, mtimeMs: st.mtimeMs, size: st.size })
				}
			} catch {
				this.index.files.delete(file)
			}
		}

		if (changed.length === 0 && removed === 0) {
			return
		}

		const parsers = await this.loadParsers(changed.map((c) => c.file))
		const contents = new Map<string, string>()
		for (let i = 0; i < changed.length; i++) {
			const { file, mtimeMs, size } = changed[i]
			let content: string
			try {
				content = await fs.promises.readFile(path.join(this.cwd, file), "utf8")
			} catch {
				continue
			}
			contents.set(file, content)
			this.index.files.set(file, { mtimeMs, size, symbols: this.parseSymbols(file, content, parsers), refs: [] })
			if (i % PARSE_BATCH === PARSE_BATCH - 1) {
				await yieldToEventLoop()
			}
		}

		// Ссылки считаем после разбора всех изменённых файлов — по полному списку имён.
		const defined = this.index.definedNames()
		for (const [file, content] of contents) {
			const entry = this.index.files.get(file)
			if (entry) {
				entry.refs = RepoMapIndex.computeRefs(content, entry.symbols, defined)
			}
		}
		this.index.rerank()
		this.saveCache()
		Logger.log(
			`[RepoMap] ${this.index.files.size} files, ${this.index.symbolCount()} symbols ` +
				`(parsed ${changed.length}, removed ${removed}) in ${Date.now() - started}ms`,
		)
	}

	private async loadParsers(files: string[]): Promise<LanguageParser> {
		const treeSitterFiles = files.filter((f) => TREE_SITTER_EXTS.includes(path.extname(f).slice(1).toLowerCase()))
		if (treeSitterFiles.length === 0) {
			return {}
		}
		try {
			const parsers = await loadRequiredLanguageParsers(treeSitterFiles)
			extendCSharpQuery(parsers)
			return parsers
		} catch (error) {
			Logger.warn("[RepoMap] tree-sitter unavailable:", error)
			return {}
		}
	}

	private parseSymbols(file: string, content: string, parsers: LanguageParser): RepoSymbol[] {
		const ext = path.extname(file).slice(1).toLowerCase()
		if (ext === "sql") {
			return extractSqlSymbols(content)
		}
		const lang = parsers[ext] as (LanguageParser[string] & { extraQuery?: { captures(n: unknown): unknown[] } }) | undefined
		if (!lang) {
			return []
		}
		try {
			const tree = lang.parser.parse(content)
			if (!tree?.rootNode) {
				return []
			}
			const captures = [...lang.query.captures(tree.rootNode), ...(lang.extraQuery?.captures(tree.rootNode) ?? [])]
			const symbols = symbolsFromCaptures(captures as Parameters<typeof symbolsFromCaptures>[0], content.split(/\r?\n/))
			tree.delete?.()
			return symbols
		} catch {
			return []
		}
	}
}
