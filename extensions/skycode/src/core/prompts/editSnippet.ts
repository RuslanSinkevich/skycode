import { diffLines } from "diff"
import { numberLines } from "../task/tools/handlers/readFileSlicing"

// [SKYCODE] Результат правки для больших файлов: только изменённые регионы с контекстом вместо всего файла.

export const EDIT_FULL_ECHO_MAX_LINES = 300
const CONTEXT_LINES = 5

/** Регионы [start, end) в 0-based индексах строк нового файла, затронутые правкой, с контекстом и слиянием. */
export function changedRegions(original: string, final: string, totalLines: number, context = CONTEXT_LINES): [number, number][] {
	const regions: [number, number][] = []
	let line = 0
	for (const part of diffLines(original, final)) {
		const count = part.count ?? part.value.split("\n").length - (part.value.endsWith("\n") ? 1 : 0)
		if (part.added) {
			regions.push([line, line + count])
			line += count
		} else if (part.removed) {
			// удаление: точка в новом файле, подсвечиваем строки вокруг
			regions.push([line, line])
		} else {
			line += count
		}
	}
	const expanded = regions.map(([s, e]) => [Math.max(0, s - context), Math.min(totalLines, e + context)] as [number, number])
	const merged: [number, number][] = []
	for (const r of expanded) {
		const last = merged[merged.length - 1]
		if (last && r[0] <= last[1]) {
			last[1] = Math.max(last[1], r[1])
		} else {
			merged.push([r[0], r[1]])
		}
	}
	return merged
}

export interface EditEcho {
	body: string
	/** true, если показаны только изменённые части */
	partial: boolean
	totalLines: number
}

/**
 * Тело <final_file_content>: весь файл при <= 300 строк (или если нет оригинала),
 * иначе только изменённые регионы с реальными номерами строк, разделёнными "...".
 */
export function buildEditEcho(finalContent: string, originalContent: string | undefined): EditEcho {
	const lines = finalContent.split("\n")
	if (lines.length <= EDIT_FULL_ECHO_MAX_LINES || originalContent === undefined || originalContent === "") {
		return { body: finalContent, partial: false, totalLines: lines.length }
	}
	const normalizedOriginal = originalContent.replace(/\r\n/g, "\n")
	const normalizedFinal = finalContent.replace(/\r\n/g, "\n")
	const finalLines = normalizedFinal.split("\n")
	const regions = changedRegions(normalizedOriginal, normalizedFinal, finalLines.length)
	const body = regions.map(([s, e]) => numberLines(finalLines.slice(s, e), s + 1, finalLines.length)).join("\n...\n")
	return { body, partial: true, totalLines: finalLines.length }
}

export function partialEditNote(totalLines: number): string {
	return `(File has ${totalLines} lines; only the changed parts are shown. Use read_file with start_line/end_line if you need more.)`
}
