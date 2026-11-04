/**
 * [SKYCODE] Извлечение определений для карты репозитория.
 *  - SQL: tree-sitter грамматики SQL в сборке нет, а нужны в основном объекты
 *    `CREATE [OR REPLACE|OR ALTER] PROCEDURE/FUNCTION/TABLE/VIEW/TRIGGER/TYPE`
 *    и `ALTER PROCEDURE` — их надёжно ловит регулярное выражение.
 *  - Остальные языки: захваты tree-sitter `name.definition.<kind>`.
 */
import type { RepoSymbol } from "./RepoMapIndex"

const MAX_SIGNATURE = 160

export function signatureOf(line: string | undefined): string {
	const s = (line ?? "").trim().replace(/\s+/g, " ")
	return s.length > MAX_SIGNATURE ? `${s.slice(0, MAX_SIGNATURE - 1)}…` : s
}

const SQL_OBJECT_RE =
	/^\s*(?:CREATE(?:\s+OR\s+(?:REPLACE|ALTER))?|ALTER)\s+(PROCEDURE|PROC|FUNCTION|TABLE|VIEW|TRIGGER|TYPE)\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:[\w$]+|\[[^\]]+\]|"[^"]+")(?:\s*\.\s*(?:[\w$]+|\[[^\]]+\]|"[^"]+"))*)/gim

const SQL_KIND: Record<string, string> = {
	procedure: "procedure",
	proc: "procedure",
	function: "function",
	table: "table",
	view: "view",
	trigger: "trigger",
	type: "type",
}

export function extractSqlSymbols(content: string): RepoSymbol[] {
	const lines = content.split(/\r?\n/)
	// Смещение начала каждой строки — чтобы перевести индекс совпадения в номер строки.
	const lineStarts: number[] = []
	let pos = 0
	for (const l of lines) {
		lineStarts.push(pos)
		pos += l.length + 1
	}
	const lineOf = (index: number): number => {
		let lo = 0
		let hi = lineStarts.length - 1
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1
			if (lineStarts[mid] <= index) {
				lo = mid
			} else {
				hi = mid - 1
			}
		}
		return lo
	}

	const symbols: RepoSymbol[] = []
	const seen = new Set<string>()
	const normalized = content.replace(/\r\n/g, "\n")
	for (const m of normalized.matchAll(SQL_OBJECT_RE)) {
		const kind = SQL_KIND[m[1].toLowerCase()] ?? m[1].toLowerCase()
		const name = m[2].replace(/\s+/g, "").replace(/[[\]"]/g, "")
		const row = lineOf((m.index ?? 0) + m[0].search(/\S/))
		const key = `${kind}:${name.toLowerCase()}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		symbols.push({ name, kind, line: row + 1, signature: signatureOf(lines[row]) })
	}
	return symbols
}

/** Минимум полей захвата tree-sitter, который нужен для карты. */
export interface CaptureLike {
	name: string
	node: { text: string; startPosition: { row: number } }
}

export function symbolsFromCaptures(captures: CaptureLike[], lines: string[]): RepoSymbol[] {
	const symbols: RepoSymbol[] = []
	const seen = new Set<string>()
	for (const c of captures) {
		if (!c.name.startsWith("name.definition.")) {
			continue
		}
		const kind = c.name.slice("name.definition.".length)
		const row = c.node.startPosition.row
		const key = `${row}:${c.node.text}`
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		symbols.push({ name: c.node.text, kind, line: row + 1, signature: signatureOf(lines[row]) })
	}
	symbols.sort((a, b) => a.line - b.line)
	return symbols
}
