import { numberLines } from "./readFileSlicing"

// [SKYCODE] Чистая логика read_symbol: разбор параметра, поиск определения по имени,
// расширение вверх до комментариев/атрибутов, лимит длины, сообщения. Без tree-sitter и vscode.

export const READ_SYMBOL_MAX_SYMBOLS = 5
export const READ_SYMBOL_MAX_LINES = 400
export const READ_SYMBOL_MAX_CONTEXT = 15
export const READ_SYMBOL_MAX_LISTED = 15
/** Максимум совпадений на одно запрошенное имя (перегрузки методов). */
const MAX_MATCHES_PER_QUERY = 5

export interface SymbolDef {
	name: string
	kind: string
	/** 1-based, включительно */
	startLine: number
	endLine: number
	/** Имя ближайшего объемлющего определения (класс/модуль) */
	parent?: string
	/** Цепочка имён объемлющих определений, от ближайшего к внешнему */
	ancestors?: string[]
}

/** Разбор `symbol`: список имён через запятую, не более 5. */
export function parseSymbolParam(value: string | undefined): string[] {
	if (!value) {
		return []
	}
	const seen = new Set<string>()
	const result: string[] = []
	for (const part of value.split(",")) {
		const name = part.trim().replace(/^["'`]|["'`]$/g, "")
		if (name && !seen.has(name)) {
			seen.add(name)
			result.push(name)
		}
	}
	return result.slice(0, READ_SYMBOL_MAX_SYMBOLS)
}

/** Проставляет parent/ancestors по вложенности диапазонов. Вход не мутируется. */
export function assignParents(defs: SymbolDef[]): SymbolDef[] {
	const sorted = [...defs].sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine)
	const result: SymbolDef[] = []
	const stack: SymbolDef[] = []
	for (const def of sorted) {
		while (stack.length > 0 && stack[stack.length - 1].endLine < def.startLine) {
			stack.pop()
		}
		// Контейнер должен содержать определение целиком и не совпадать с ним по диапазону.
		const containers = stack.filter(
			(c) => c.startLine <= def.startLine && c.endLine >= def.endLine && !(c.startLine === def.startLine && c.endLine === def.endLine),
		)
		const ancestors = containers.map((c) => c.name).reverse()
		const withParent: SymbolDef = { ...def, parent: ancestors[0], ancestors }
		result.push(withParent)
		stack.push(withParent)
	}
	return result
}

/** Отображаемое имя: `Parent.Name` для вложенных. */
export function displayName(def: SymbolDef): string {
	return def.parent ? `${def.parent}.${def.name}` : def.name
}

function matchOne(defs: SymbolDef[], query: string, ci: boolean): SymbolDef[] {
	const norm = (s: string) => (ci ? s.toLowerCase() : s)
	const parts = query.split(".").filter((p) => p.length > 0)
	if (parts.length === 0) {
		return []
	}
	const target = norm(parts[parts.length - 1])
	const qualifiers = parts.slice(0, -1).map(norm)
	return defs.filter((d) => {
		if (norm(d.name) !== target) {
			return false
		}
		if (qualifiers.length === 0) {
			return true
		}
		// A.B: ближайший предок — A; для A.B.C — предки C это B, затем A
		const chain = (d.ancestors ?? []).map(norm)
		const need = [...qualifiers].reverse()
		return need.every((q, i) => chain[i] === q)
	})
}

export interface SymbolLookup {
	query: string
	matches: SymbolDef[]
}

/** Для каждого имени: точное совпадение, иначе без учёта регистра. */
export function findSymbols(defs: SymbolDef[], queries: string[]): SymbolLookup[] {
	return queries.map((query) => {
		let matches = matchOne(defs, query, false)
		if (matches.length === 0) {
			matches = matchOne(defs, query, true)
		}
		// Вложенное с тем же именем (конструктор внутри одноимённого класса) не дублируем
		matches = matches.filter(
			(m) => !matches.some((o) => o !== m && o.startLine <= m.startLine && o.endLine >= m.endLine && o.name === m.name && o.startLine !== m.startLine),
		)
		matches.sort((a, b) => a.startLine - b.startLine)
		return { query, matches: matches.slice(0, MAX_MATCHES_PER_QUERY) }
	})
}

const LEADING_CONTEXT_RE = /^\s*(\/\/|\/\*|\*|#|@|\[|--|"""|''')/

/** Поднимает начало вверх, пока строки выше — комментарии/атрибуты/декораторы (не более max строк). */
export function extendStartUp(lines: string[], startLine: number, max = READ_SYMBOL_MAX_CONTEXT): number {
	let start = startLine
	while (start > 1 && startLine - start < max && LEADING_CONTEXT_RE.test(lines[start - 2] ?? "")) {
		start--
	}
	return start
}

/** Один найденный символ в формате read_file: заголовок + строки с номерами. */
export function formatSymbol(lines: string[], def: SymbolDef, relPath: string): string {
	const start = extendStartUp(lines, def.startLine)
	const end = Math.min(def.endLine, lines.length)
	const cappedEnd = Math.min(end, start + READ_SYMBOL_MAX_LINES - 1)
	const body = numberLines(
		lines.slice(start - 1, cappedEnd).map((l) => l.replace(/\r$/, "")),
		start,
		lines.length,
	)
	let out = `// ${relPath} lines ${start}-${cappedEnd} (${def.kind} ${displayName(def)})\n${body}`
	if (cappedEnd < end) {
		out += `\n[... symbol continues to line ${end} — use read_file with start_line/end_line]`
	}
	return out
}

export function notFoundMessage(query: string, relPath: string, defs: SymbolDef[]): string {
	const names: string[] = []
	for (const d of [...defs].sort((a, b) => a.startLine - b.startLine)) {
		const n = displayName(d)
		if (!names.includes(n)) {
			names.push(n)
		}
	}
	if (names.length === 0) {
		return `Symbol "${query}" not found in ${relPath}. No symbols were detected in this file — use search_files with the name, then read_file with start_line/end_line.`
	}
	const shown = names.slice(0, READ_SYMBOL_MAX_LISTED).join(", ")
	const more = names.length > READ_SYMBOL_MAX_LISTED ? `, ... (+${names.length - READ_SYMBOL_MAX_LISTED} more)` : ""
	return `Symbol "${query}" not found in ${relPath}. Symbols in this file: ${shown}${more}`
}

export function unsupportedLanguageMessage(relPath: string): string {
	return `read_symbol does not support this file type (${relPath}). Use search_files with the symbol name to find its line, then read_file with start_line/end_line.`
}

/** Полный вывод для набора запросов. */
export function buildReadSymbolOutput(content: string, defs: SymbolDef[], queries: string[], relPath: string): string {
	const lines = content.split("\n")
	const withParents = assignParents(defs)
	const lookups = findSymbols(withParents, queries)
	const chunks: string[] = []
	const printed = new Set<string>()
	for (const { query, matches } of lookups) {
		if (matches.length === 0) {
			chunks.push(notFoundMessage(query, relPath, withParents))
			continue
		}
		for (const m of matches) {
			const key = `${m.startLine}-${m.endLine}-${m.name}`
			if (printed.has(key)) {
				continue
			}
			printed.add(key)
			chunks.push(formatSymbol(lines, m, relPath))
		}
	}
	return chunks.join("\n\n")
}
