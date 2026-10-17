// [SKYCODE] Поиск наиболее похожего участка файла для подсказки при промахе SEARCH-блока.

const MAX_FILE_LINES = 20000
const MAX_SEARCH_LINES = 100
const MAX_SHOWN_LINES = 30
const MIN_SIMILARITY = 0.4

export interface ClosestMatch {
	/** 1-based, включительно */
	startLine: number
	endLine: number
	score: number
}

function normalizeLine(line: string): string {
	return line.replace(/\r$/, "").trim().replace(/\s+/g, " ")
}

function tokens(line: string): Set<string> {
	const set = new Set<string>()
	for (const t of line.split(/[^A-Za-z0-9_$]+/)) {
		if (t) {
			set.add(t)
		}
	}
	return set
}

function lineSimilarity(a: string, ta: Set<string>, b: string, tb: Set<string>): number {
	if (a === b) {
		return a === "" ? 0.3 : 1
	}
	if (a === "" || b === "") {
		return 0
	}
	if (ta.size === 0 || tb.size === 0) {
		return 0
	}
	let inter = 0
	for (const t of ta) {
		if (tb.has(t)) {
			inter++
		}
	}
	const jaccard = inter / (ta.size + tb.size - inter)
	// Совпадение только по пробелам/регистру считаем почти точным
	return a.toLowerCase().replace(/\s+/g, "") === b.toLowerCase().replace(/\s+/g, "") ? 0.95 : jaccard * 0.9
}

/**
 * Находит окно строк файла (длина блока ±2), наиболее похожее на SEARCH-блок.
 * Сложность O(строки файла × строки блока). Возвращает undefined, если файл слишком большой.
 */
export function findClosestMatch(fileContent: string, searchContent: string): ClosestMatch | undefined {
	const fileLines = fileContent.split("\n")
	if (fileLines.length > MAX_FILE_LINES) {
		return undefined
	}
	let searchLines = searchContent.replace(/\n+$/, "").split("\n")
	if (searchLines.length > MAX_SEARCH_LINES) {
		searchLines = searchLines.slice(0, MAX_SEARCH_LINES)
	}
	const n = searchLines.length
	if (n === 0 || fileLines.length === 0) {
		return undefined
	}

	const fileNorm = fileLines.map(normalizeLine)
	const fileTok = fileNorm.map(tokens)
	const searchNorm = searchLines.map(normalizeLine)
	const searchTok = searchNorm.map(tokens)

	// sim[j][i] — похожесть j-й строки блока и i-й строки файла
	const sim: Float32Array[] = []
	for (let j = 0; j < n; j++) {
		const row = new Float32Array(fileLines.length)
		for (let i = 0; i < fileLines.length; i++) {
			row[i] = lineSimilarity(searchNorm[j], searchTok[j], fileNorm[i], fileTok[i])
		}
		sim.push(row)
	}

	let best: ClosestMatch | undefined
	for (let size = Math.max(1, n - 2); size <= n + 2; size++) {
		if (size > fileLines.length) {
			break
		}
		const compared = Math.min(n, size)
		for (let start = 0; start + size <= fileLines.length; start++) {
			let sum = 0
			for (let j = 0; j < compared; j++) {
				sum += sim[j][start + j]
			}
			const score = sum / Math.max(n, size)
			if (!best || score > best.score) {
				best = { startLine: start + 1, endLine: start + size, score }
			}
		}
	}
	return best
}

/**
 * Текст-подсказка для сообщения об ошибке: ближайший участок файла с номерами строк
 * или совет перечитать файл, если похожего места нет.
 */
export function closestMatchHint(fileContent: string, searchContent: string): string {
	const rereadHint = "No similar region found — re-read the file (read_file with start_line/end_line) before editing."
	const match = findClosestMatch(fileContent, searchContent)
	if (!match || match.score < MIN_SIMILARITY) {
		return rereadHint
	}
	const fileLines = fileContent.split("\n").map((l) => l.replace(/\r$/, ""))
	const shownEnd = Math.min(match.endLine, match.startLine + MAX_SHOWN_LINES - 1)
	const body = fileLines
		.slice(match.startLine - 1, shownEnd)
		.map((line, idx) => `${String(match.startLine + idx).padStart(6)}|${line}`)
		.join("\n")
	const more = shownEnd < match.endLine ? "\n... (region continues)" : ""
	return `Closest match in the file (lines ${match.startLine}-${match.endLine}) — copy the SEARCH text exactly from here:\n${body}${more}`
}
