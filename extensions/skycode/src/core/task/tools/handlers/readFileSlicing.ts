import * as crypto from "crypto"

// [SKYCODE] Чистые хелперы read_file: срез по строкам, мягкий лимит, заглушка для повторного чтения.

export const READ_FILE_MAX_LINES = 2000

/** Запись о последнем отданном модели полном чтении файла (для заглушки «не изменился»). */
export interface ReadFileCacheEntry {
	hash: string
	/** Длина apiConversationHistory в момент чтения */
	historyLength: number
	/** Ключ conversationHistoryDeletedRange в момент чтения */
	deletedRangeKey: string
	totalLines: number
}

export function hashContent(text: string): string {
	return crypto.createHash("sha1").update(text).digest("hex")
}

export function deletedRangeKey(range: [number, number] | undefined): string {
	return range ? `${range[0]}-${range[1]}` : ""
}

/** Разбор start_line/end_line: нечисловое и < 1 игнорируем (мягко). */
export function parseLineParam(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined
	}
	const n = Number.parseInt(value.trim(), 10)
	if (!Number.isFinite(n) || n < 1) {
		return undefined
	}
	return n
}

/** Строки с реальными номерами: "     N|text" */
export function numberLines(lines: string[], firstLineNumber: number, totalLines: number): string {
	const padding = Math.max(6, String(totalLines).length)
	return lines.map((line, i) => `${String(firstLineNumber + i).padStart(padding)}|${line}`).join("\n")
}

export interface ReadSlice {
	output: string
	totalLines: number
	/** true, если показана не вся файловая выдача (нужна пометка для оптимизатора контекста) */
	partial: boolean
}

/**
 * Срез текста файла по start_line/end_line (1-based, включительно) с мягким лимитом MAX строк.
 * Без диапазона и для файла <= MAX строк отдаёт всё.
 */
export function sliceForRead(text: string, startLine?: number, endLine?: number, maxLines = READ_FILE_MAX_LINES): ReadSlice {
	if (!text || text.length === 0) {
		return { output: text, totalLines: 0, partial: false }
	}
	const lines = text.split("\n")
	const total = lines.length
	const start = startLine ?? 1
	if (start > total) {
		return {
			output: `File has ${total} lines; start_line ${start} is beyond the end.`,
			totalLines: total,
			partial: true,
		}
	}
	if (endLine !== undefined && endLine < start) {
		return {
			output: `File has ${total} lines; end_line ${endLine} is before start_line ${start}.`,
			totalLines: total,
			partial: true,
		}
	}
	const end = Math.min(endLine ?? total, total, start + maxLines - 1)
	const body = numberLines(lines.slice(start - 1, end), start, total)
	if (start === 1 && end === total) {
		return { output: body, totalLines: total, partial: false }
	}
	const more = end < total ? " Call read_file again with start_line/end_line to read more." : ""
	return { output: `${body}\n[File has ${total} lines; showing ${start}-${end}.${more}]`, totalLines: total, partial: true }
}

/**
 * Можно ли вернуть заглушку вместо повторного чтения.
 * Только если: тот же hash, не менялся conversationHistoryDeletedRange (нет truncation/condense),
 * и прошлый результат лежит за пределами удалённого диапазона.
 */
export function canStubReread(
	entry: ReadFileCacheEntry | undefined,
	hash: string,
	deletedRange: [number, number] | undefined,
	historyLength = Number.POSITIVE_INFINITY,
): boolean {
	if (!entry || entry.hash !== hash) {
		return false
	}
	if (entry.deletedRangeKey !== deletedRangeKey(deletedRange)) {
		return false
	}
	// [SKYCODE] История стала короче (откат сообщений) — прошлого результата может уже не быть
	if (historyLength < entry.historyLength) {
		return false
	}
	if (deletedRange && entry.historyLength <= deletedRange[1]) {
		return false
	}
	return true
}

export function unchangedStub(totalLines: number): string {
	return `[File unchanged since you read it earlier in this conversation (${totalLines} lines). Use that earlier content. To get it again anyway, call read_file with start_line=1.]`
}
