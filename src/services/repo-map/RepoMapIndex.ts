/**
 * [SKYCODE] Карта репозитория — ядро без IO (тестируется без tree-sitter и диска).
 *
 * Вместо векторного индекса (эмбеддинги каждого фрагмента кода нейросетью на CPU —
 * часы на большом проекте, сотни МБ модели) держим список определений по файлам:
 * классы, методы, функции, процедуры — с файлом, строкой и первой строкой
 * объявления. Строится за секунды tree-sitter'ом, обновляется по одному файлу.
 *
 * Важность файла — как в «repo map» Aider: чем в большем числе других файлов
 * упоминаются его символы, тем он важнее (на него опирается остальной код).
 */

export interface RepoSymbol {
	/** Имя: `UserService`, `GetById`, `dbo.spTCFindPactSAP`. */
	name: string
	/** Вид: class / interface / method / function / module / procedure / table / … */
	kind: string
	/** Строка (1-based). */
	line: number
	/** Первая строка объявления, обрезанная — то, что видит агент. */
	signature: string
}

export interface RepoFileEntry {
	mtimeMs: number
	size: number
	symbols: RepoSymbol[]
	/** Имена символов ДРУГИХ файлов, которые встречаются в этом файле. */
	refs: string[]
}

export interface SymbolHit {
	file: string
	symbol: RepoSymbol
	score: number
}

const MIN_TOKEN = 3
const STOP_WORDS = new Set([
	"the",
	"and",
	"for",
	"with",
	"from",
	"that",
	"this",
	"how",
	"where",
	"what",
	"which",
	"into",
	"are",
	"was",
	"get",
	"set",
	"find",
	"code",
	"file",
	"files",
	"function",
	"method",
	"class",
])

/** `getUserById` / `get_user_by_id` / `GetUserByID` → `get user by id`. */
export function splitIdentifier(name: string): string[] {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.split(/[^A-Za-z0-9А-Яа-яЁё]+/)
		.map((p) => p.toLowerCase())
		.filter((p) => p.length > 0)
}

/** Слова запроса: разбитые идентификаторы и обычные слова, без стоп-слов. */
export function queryTerms(query: string): string[] {
	const terms = new Set<string>()
	for (const raw of query.split(/[\s,.;:()"'`?!]+/)) {
		if (!raw) {
			continue
		}
		const lower = raw.toLowerCase()
		if (lower.length >= MIN_TOKEN && !STOP_WORDS.has(lower)) {
			terms.add(lower)
		}
		for (const part of splitIdentifier(raw)) {
			if (part.length >= MIN_TOKEN && !STOP_WORDS.has(part)) {
				terms.add(part)
			}
		}
	}
	return [...terms]
}

/** Все идентификаторы файла (для подсчёта ссылок). */
export function identifiersOf(content: string): Set<string> {
	const ids = new Set<string>()
	for (const m of content.matchAll(/[A-Za-z_][A-Za-z0-9_]{2,}/g)) {
		ids.add(m[0])
	}
	return ids
}

/** Короткое имя символа для поиска ссылок: `dbo.spFoo` → `spFoo`, `[dbo].[spFoo]` → `spFoo`. */
export function bareName(name: string): string {
	const last = name.split(".").pop() ?? name
	return last.replace(/[[\]"`]/g, "")
}

/** Члены типа: на важность файла влияют слабее, чем сами типы/функции верхнего уровня. */
const MAX_OVERVIEW_DEF_FILES = 3
const MEMBER_KINDS = new Set(["method", "property", "constructor", "field"])

export function isMemberKind(kind: string): boolean {
	return MEMBER_KINDS.has(kind)
}

export class RepoMapIndex {
	readonly files = new Map<string, RepoFileEntry>()
	/** имя символа → в скольких файлах (кроме определяющих) оно встречается */
	private refCount = new Map<string, number>()
	/** имя символа → в скольких файлах оно определено */
	private defCount = new Map<string, number>()
	private fileScore = new Map<string, number>()

	/** Множество имён всех определённых символов — для вычисления refs файла. */
	definedNames(): Set<string> {
		const names = new Set<string>()
		for (const entry of this.files.values()) {
			for (const s of entry.symbols) {
				names.add(bareName(s.name))
			}
		}
		return names
	}

	/** Ссылки файла: какие определённые в проекте имена встречаются в его тексте (кроме своих). */
	static computeRefs(content: string, ownSymbols: RepoSymbol[], defined: Set<string>): string[] {
		const own = new Set(ownSymbols.map((s) => bareName(s.name)))
		const refs: string[] = []
		for (const id of identifiersOf(content)) {
			if (defined.has(id) && !own.has(id)) {
				refs.push(id)
			}
		}
		return refs
	}

	/**
	 * Вес имени: сколько файлов на него ссылается, делённое на число файлов, где
	 * оно определено. Общие имена (`get`, `update`, `dispose`) определены в десятках
	 * файлов и упоминаются везде — без деления они забивали бы карту шумом.
	 */
	nameWeight(name: string): number {
		const bare = bareName(name)
		return Math.log1p(this.refCount.get(bare) ?? 0) / Math.max(1, this.defCount.get(bare) ?? 1)
	}

	/** Пересчитать ранги после изменения файлов. O(сумма refs). */
	rerank(): void {
		const refCount = new Map<string, number>()
		const defCount = new Map<string, number>()
		for (const entry of this.files.values()) {
			for (const r of entry.refs) {
				refCount.set(r, (refCount.get(r) ?? 0) + 1)
			}
			for (const name of new Set(entry.symbols.map((s) => bareName(s.name)))) {
				defCount.set(name, (defCount.get(name) ?? 0) + 1)
			}
		}
		this.refCount = refCount
		this.defCount = defCount
		const fileScore = new Map<string, number>()
		for (const [file, entry] of this.files) {
			let score = 0
			for (const s of entry.symbols) {
				score += this.nameWeight(s.name) * (isMemberKind(s.kind) ? 0.25 : 1)
			}
			fileScore.set(file, score)
		}
		this.fileScore = fileScore
	}

	symbolCount(): number {
		let n = 0
		for (const e of this.files.values()) {
			n += e.symbols.length
		}
		return n
	}

	/** Поиск символов по словам запроса: совпадение частей имени, пути и сигнатуры + важность файла. */
	search(query: string, limit = 30): SymbolHit[] {
		const terms = queryTerms(query)
		if (terms.length === 0) {
			return []
		}
		// Редкость слова (IDF по именам символов): «sqlite» встречается в паре имён и
		// важнее, чем «update», который есть в сотне методов.
		const total = Math.max(1, this.symbolCount())
		const df = new Map<string, number>(terms.map((t) => [t, 0]))
		for (const entry of this.files.values()) {
			for (const symbol of entry.symbols) {
				const nameLower = bareName(symbol.name).toLowerCase()
				for (const t of terms) {
					if (nameLower.includes(t)) {
						df.set(t, (df.get(t) ?? 0) + 1)
					}
				}
			}
		}
		const idf = new Map(terms.map((t) => [t, Math.log(1 + total / (1 + (df.get(t) ?? 0)))]))
		const hits: SymbolHit[] = []
		for (const [file, entry] of this.files) {
			const pathParts = new Set(splitIdentifier(file))
			const pathLower = file.toLowerCase()
			for (const symbol of entry.symbols) {
				const nameParts = splitIdentifier(bareName(symbol.name))
				const nameLower = bareName(symbol.name).toLowerCase()
				const sigLower = symbol.signature.toLowerCase()
				let score = 0
				let matched = 0
				let ownMatch = false
				for (const t of terms) {
					let s = 0
					if (nameLower === t) {
						s = 6
					} else if (nameParts.includes(t)) {
						s = 4
					} else if (nameLower.includes(t)) {
						s = 2.5
					} else if (sigLower.includes(t)) {
						s = 1
					}
					if (s > 0) {
						ownMatch = true
					}
					if (pathParts.has(t)) {
						s += 1.5
					} else if (pathLower.includes(t)) {
						s += 0.5
					}
					if (s > 0) {
						matched++
					}
					score += s * (idf.get(t) ?? 1)
				}
				if (score === 0) {
					continue
				}
				// Совпал только путь — показываем лишь сам тип/функцию, а не каждый метод файла.
				if (!ownMatch && isMemberKind(symbol.kind)) {
					continue
				}
				// Совпали все слова — сильно выше; важность символа — тай-брейк.
				score *= 1 + matched / terms.length
				score += this.nameWeight(symbol.name) * 0.3
				hits.push({ file, symbol, score })
			}
		}
		hits.sort((a, b) => b.score - a.score)
		return hits.slice(0, limit)
	}

	private symbolRank(s: RepoSymbol): number {
		return this.nameWeight(s.name) + (isMemberKind(s.kind) ? 0 : 1)
	}

	/** Найденные символы, сгруппированные по файлам. */
	static renderHits(hits: SymbolHit[]): string {
		const byFile = new Map<string, SymbolHit[]>()
		for (const h of hits) {
			const list = byFile.get(h.file) ?? []
			list.push(h)
			byFile.set(h.file, list)
		}
		let out = ""
		for (const [file, list] of byFile) {
			out += `${file}\n`
			for (const h of list.sort((a, b) => a.symbol.line - b.symbol.line)) {
				out += `  ${h.symbol.line}: ${h.symbol.signature}\n`
			}
		}
		return out
	}

	/**
	 * Обзор проекта для первого сообщения: самые важные файлы и их символы,
	 * пока не исчерпан бюджет символов (≈ 4 символа на токен).
	 */
	renderOverview(maxChars = 6000, maxSymbolsPerFile = 8): string {
		const ranked = [...this.files.entries()]
			.filter(([, e]) => e.symbols.length > 0)
			.sort((a, b) => (this.fileScore.get(b[0]) ?? 0) - (this.fileScore.get(a[0]) ?? 0))
		let out = ""
		for (const [file, entry] of ranked) {
			// Перегрузки/переопределения одного имени показываем один раз; имена, объявленные
			// во многих файлах (`namespace App`, `Dispose`, `Show`), о файле ничего не говорят.
			const seen = new Set<string>()
			const symbols = [...entry.symbols]
				.filter((sym) => (this.defCount.get(bareName(sym.name)) ?? 1) <= MAX_OVERVIEW_DEF_FILES)
				.sort((a, b) => this.symbolRank(b) - this.symbolRank(a))
				.filter((sym) => !seen.has(sym.name) && seen.add(sym.name) !== undefined)
				.slice(0, maxSymbolsPerFile)
				.sort((a, b) => a.line - b.line)
			let block = `${file}\n`
			for (const s of symbols) {
				block += `  ${s.line}: ${s.signature}\n`
			}
			if (out.length + block.length > maxChars) {
				break
			}
			out += block
		}
		return out
	}
}
