// [SKYCODE] Чистые помощники для environment_details: не слать неизменившиеся секции
// и ограничивать вывод терминала. Без зависимостей от vscode — легко тестировать.

export interface EnvSectionInput {
	key: string
	/** Готовый текст секции (с заголовком). Пустая строка — секции нет. */
	body: string
	/** Секция уходит каждый раз (режим, использование контекста). */
	always?: boolean
	/** Секция уходит не чаще чем раз в N мс (время); содержимое не сравнивается. */
	minIntervalMs?: number
}

export interface EnvSectionCache {
	/** Значение conversationHistoryDeletedRange, с которым собран кэш: сменилось — контекст урезан, шлём всё заново. */
	deletedRangeKey: string
	sections: Record<string, { body: string; sentAt: number }>
}

export const ENV_TIME_INTERVAL_MS = 10 * 60 * 1000

export function deletedRangeToKey(range: [number, number] | undefined): string {
	return range ? `${range[0]}-${range[1]}` : ""
}

/**
 * Решает, какие секции отправить в этот раз. Возвращает тексты (в исходном порядке) и новый кэш.
 * Первый вызов (кэша нет) или смена deletedRange — всё целиком.
 */
export function selectEnvSections(
	sections: EnvSectionInput[],
	prev: EnvSectionCache | undefined,
	deletedRangeKey: string,
	now: number,
	forceAll = false,
): { texts: Map<string, string>; cache: EnvSectionCache } {
	const resend = forceAll || !prev || prev.deletedRangeKey !== deletedRangeKey
	const next: EnvSectionCache = {
		deletedRangeKey,
		sections: resend ? {} : { ...prev!.sections },
	}
	const texts = new Map<string, string>()

	for (const s of sections) {
		if (!s.body) {
			// Секция исчезла: забываем, чтобы при возвращении она ушла снова.
			delete next.sections[s.key]
			continue
		}
		const old = next.sections[s.key]
		let send: boolean
		if (resend || !old || s.always) {
			send = true
		} else if (s.minIntervalMs !== undefined) {
			send = now - old.sentAt >= s.minIntervalMs
		} else {
			send = old.body !== s.body
		}
		if (send) {
			texts.set(s.key, s.body)
			// У always-секций тело не храним: сравнивать их не нужно
			next.sections[s.key] = { body: s.always ? "" : s.body, sentAt: now }
		}
	}
	return { texts, cache: next }
}

export const TERMINAL_OUTPUT_MAX_LINES = 40
export const TERMINAL_OUTPUT_MAX_CHARS = 4000

/** Оставляет последние строки вывода терминала в пределах лимитов, сверху пишет сколько строк опущено. */
export function capTerminalOutput(
	output: string,
	maxLines = TERMINAL_OUTPUT_MAX_LINES,
	maxChars = TERMINAL_OUTPUT_MAX_CHARS,
): string {
	const lines = output.split("\n")
	let kept = lines.length > maxLines ? lines.slice(-maxLines) : lines
	let size = kept.reduce((n, l) => n + l.length + 1, 0)
	while (kept.length > 1 && size > maxChars) {
		size -= kept[0].length + 1
		kept = kept.slice(1)
	}
	if (kept.length === 1 && kept[0].length > maxChars) {
		kept = [kept[0].slice(-maxChars)]
	}
	const omitted = lines.length - kept.length
	const truncatedSingle = kept.length === 1 && kept[0] !== lines[lines.length - 1]
	if (omitted <= 0 && !truncatedSingle) {
		return output
	}
	return `(… ${omitted} earlier lines omitted)\n${kept.join("\n")}`
}
