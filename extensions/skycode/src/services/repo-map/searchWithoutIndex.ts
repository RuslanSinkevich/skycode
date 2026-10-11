/**
 * [SKYCODE] codebase_search без векторного индекса: карта символов + ripgrep.
 *
 * 1. Символы (классы, методы, процедуры…), чьи имена / пути / сигнатуры
 *    совпадают со словами запроса — сразу с файлом и строкой.
 * 2. Текстовые совпадения ripgrep по тем же словам — ловят комментарии, строки и
 *    русские формулировки, которых нет в именах символов. Файлы ранжируются по
 *    числу разных слов запроса, а не выводятся первые попавшиеся строки.
 */
import * as childProcess from "node:child_process"
import * as readline from "node:readline"
import type { SkycodeIgnoreController } from "@core/ignore/SkycodeIgnoreController"
import { getBinaryLocation } from "@/utils/fs"
import { RepoMap, sourceGlobArgs } from "./RepoMap"
import { queryTerms, RepoMapIndex } from "./RepoMapIndex"

const MAX_TEXT_TERMS = 6
const MAX_TEXT_FILES = 8
const MAX_LINES_PER_FILE = 3
const MAX_MATCHES_PER_FILE = 20
const RG_TIMEOUT_MS = 15_000
/** Тексты, где тоже пишут предметные слова: разметка, конфиги, документация. */
const TEXT_EXTRA_EXTS = ["cshtml", "razor", "xaml", "html", "vue", "svelte", "md", "json", "xml", "config", "yaml", "yml"]

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Грубый «стемминг» для русских слов: отрезаем окончание, чтобы «договора»,
 * «договору», «договор» находили друг друга. Латиницу не трогаем — там важна точность имён.
 */
export function textSearchStem(term: string): string {
	if (/[а-яё]/i.test(term) && term.length > 5) {
		return term.slice(0, term.length - 2)
	}
	return term
}

/** Основы слов запроса для текстового поиска (длинные — первыми). */
export function textSearchStems(query: string): string[] {
	return [
		...new Set(
			queryTerms(query)
				.filter((t) => t.length >= 4)
				.map(textSearchStem),
		),
	]
		.sort((a, b) => b.length - a.length)
		.slice(0, MAX_TEXT_TERMS)
}

export function textSearchPattern(query: string): string | null {
	const stems = textSearchStems(query)
	if (stems.length === 0) {
		return null
	}
	return `(?i)(${stems.map(escapeRegex).join("|")})`
}

export interface TextMatch {
	file: string
	line: number
	text: string
}

/**
 * Файлы по убыванию «сколько разных слов запроса в них есть», затем — числа
 * совпадений. Для каждого файла — первые строки, лучше всего покрывающие слова.
 */
export function rankTextMatches(matches: TextMatch[], stems: string[], maxFiles = MAX_TEXT_FILES): string {
	const byFile = new Map<string, TextMatch[]>()
	for (const m of matches) {
		const list = byFile.get(m.file) ?? []
		list.push(m)
		byFile.set(m.file, list)
	}
	const termsIn = (text: string): number => {
		const lower = text.toLowerCase()
		return stems.filter((s) => lower.includes(s)).length
	}
	const ranked = [...byFile.entries()]
		.map(([file, list]) => {
			const covered = new Set<string>()
			for (const m of list) {
				const lower = m.text.toLowerCase()
				for (const s of stems) {
					if (lower.includes(s)) {
						covered.add(s)
					}
				}
			}
			return { file, list, covered: covered.size }
		})
		.sort((a, b) => b.covered - a.covered || b.list.length - a.list.length)

	let out = ""
	for (const { file, list } of ranked.slice(0, maxFiles)) {
		const lines = [...list]
			.sort((a, b) => termsIn(b.text) - termsIn(a.text) || a.line - b.line)
			.slice(0, MAX_LINES_PER_FILE)
			.sort((a, b) => a.line - b.line)
		out += `${file} (${list.length} match${list.length === 1 ? "" : "es"})\n`
		for (const m of lines) {
			const text = m.text.trim()
			out += `  ${m.line}: ${text.length > 200 ? `${text.slice(0, 199)}…` : text}\n`
		}
	}
	if (ranked.length > maxFiles) {
		out += `… and ${ranked.length - maxFiles} more files (use search_files to see them)\n`
	}
	return out
}

async function ripgrepMatches(cwd: string, pattern: string, encoding?: string): Promise<TextMatch[]> {
	const rg = await getBinaryLocation("rg")
	const args = ["--json", "--max-count", String(MAX_MATCHES_PER_FILE), ...sourceGlobArgs(TEXT_EXTRA_EXTS)]
	if (encoding) {
		args.push("--encoding", encoding)
	}
	args.push("-e", pattern, ".")
	return new Promise((resolve) => {
		const proc = childProcess.spawn(rg, args, { cwd })
		const matches: TextMatch[] = []
		const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity })
		const timer = setTimeout(() => proc.kill(), RG_TIMEOUT_MS)
		rl.on("line", (line) => {
			try {
				const parsed = JSON.parse(line)
				if (parsed.type !== "match") {
					return
				}
				const file = String(parsed.data.path.text ?? "")
					.replace(/\\/g, "/")
					.replace(/^\.\//, "")
				matches.push({ file, line: parsed.data.line_number, text: String(parsed.data.lines.text ?? "") })
			} catch {
				// не JSON — пропускаем
			}
		})
		proc.on("error", () => resolve(matches))
		rl.on("close", () => {
			clearTimeout(timer)
			resolve(matches)
		})
	})
}

/**
 * Совпадения в UTF-8 и, если в запросе есть кириллица, — в Windows-1251:
 * старые проекты (WinForms, 1С-выгрузки, SQL-скрипты) часто хранят исходники в ней.
 * В UTF-8-файлах кириллица в cp1251 не совпадёт, так что ложных срабатываний нет.
 */
async function textMatches(cwd: string, pattern: string): Promise<TextMatch[]> {
	const runs = [ripgrepMatches(cwd, pattern)]
	if (/[а-яё]/i.test(pattern)) {
		runs.push(ripgrepMatches(cwd, pattern, "windows-1251"))
	}
	const seen = new Set<string>()
	const all: TextMatch[] = []
	for (const list of await Promise.all(runs)) {
		for (const m of list) {
			const key = `${m.file}:${m.line}`
			if (seen.has(key)) {
				continue
			}
			seen.add(key)
			all.push(m)
		}
	}
	return all
}

export async function searchWithoutIndex(
	cwd: string,
	query: string,
	maxResults = 10,
	ignoreController?: SkycodeIgnoreController,
): Promise<string> {
	const map = RepoMap.for(cwd)
	const pattern = textSearchPattern(query)
	const [, text] = await Promise.all([map.ensureFresh(), pattern ? textMatches(cwd, pattern) : Promise.resolve([])])

	let out = ""
	const hits = map.index
		.search(query, Math.max(maxResults * 3, 15))
		.filter((h) => !ignoreController || ignoreController.validateAccess(h.file))
	if (hits.length > 0) {
		out += `## Symbols matching the query (file → line: declaration)\n${RepoMapIndex.renderHits(hits)}\n`
	}

	const allowed = text.filter((m) => !ignoreController || ignoreController.validateAccess(m.file))
	if (allowed.length > 0) {
		out += `## Text matches (files with the most query words first)\n${rankTextMatches(allowed, textSearchStems(query))}`
	}

	if (!out) {
		return (
			`No symbols or text matched "${query}". Try different words (identifiers in English, ` +
			"domain words as they appear in comments), or use search_files / glob."
		)
	}
	return out
}
