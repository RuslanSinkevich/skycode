// [SKYCODE] Усечение длинного вывода команд для модели: голова + хвост (ошибки обычно в конце).

export interface TruncateOutputOptions {
	/** Максимум строк до усечения */
	maxLines?: number
	/** Максимум символов до усечения */
	maxChars?: number
	/** Сколько строк оставить с начала */
	headLines?: number
	/** Сколько строк оставить с конца */
	tailLines?: number
}

export const DEFAULT_MAX_LINES = 200
export const DEFAULT_MAX_CHARS = 12000
export const DEFAULT_HEAD_LINES = 40
export const DEFAULT_TAIL_LINES = 120

/** Опции из пользовательского лимита строк: не выше 200, голова ~20%, хвост ~60% */
export function outputLimitOptions(userLimit: number): TruncateOutputOptions {
	const maxLines = Math.max(10, Math.min(userLimit, DEFAULT_MAX_LINES))
	return {
		maxLines,
		headLines: Math.floor(maxLines * 0.2),
		tailLines: Math.floor(maxLines * 0.6),
	}
}

function marker(omitted: number): string {
	return `\n... [${omitted} lines omitted — rerun with a narrower command, or redirect to a file and read it with read_file/search_files] ...\n`
}

function countLines(s: string): number {
	let n = 1
	for (let i = 0; i < s.length; i++) {
		if (s.charCodeAt(i) === 10) {
			n++
		}
	}
	return n
}

/**
 * Чистая функция: если вывод длиннее лимитов, оставляет голову и хвост,
 * между ними вставляет маркер. Общий размер ограничивается maxChars (голова режется первой).
 */
export function truncateOutput(output: string, opts: TruncateOutputOptions = {}): string {
	const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES
	const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS
	const headCount = opts.headLines ?? DEFAULT_HEAD_LINES
	const tailCount = opts.tailLines ?? DEFAULT_TAIL_LINES

	if (output.length <= maxChars && countLines(output) <= maxLines) {
		return output
	}

	const lines = output.split("\n")
	let head: string[]
	let tail: string[]
	if (lines.length > headCount + tailCount) {
		head = lines.slice(0, headCount)
		tail = lines.slice(lines.length - tailCount)
	} else {
		// Строк мало, но символов много: оставляем только хвост
		head = []
		tail = lines
	}

	const size = () => head.join("\n").length + tail.join("\n").length
	while (head.length > 0 && size() > maxChars) {
		head.pop()
	}
	while (tail.length > 1 && size() > maxChars) {
		tail.shift()
	}
	let tailText = tail.join("\n")
	if (tailText.length > maxChars) {
		tailText = tailText.slice(tailText.length - maxChars)
	}

	const omitted = lines.length - head.length - tail.length
	return `${head.join("\n")}${marker(omitted)}${tailText}`
}
