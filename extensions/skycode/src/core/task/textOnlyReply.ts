import { toolParamNames } from "@core/assistant-message"
import { SkycodeDefaultTool } from "@shared/tools"

const TOOL_NAMES = new Set<string>(Object.values(SkycodeDefaultTool))
// [SKYCODE] Имена параметров, которые легко встретить в обычном тексте про HTML/код (<input>, <title>, <type>...)
const AMBIGUOUS_PARAM_TAGS = new Set([
	"input",
	"title",
	"data",
	"text",
	"type",
	"id",
	"action",
	"context",
	"options",
	"result",
	"response",
	"query",
	"prompt",
])
const PARAM_TAGS = new Set<string>(toolParamNames.filter((name) => !AMBIGUOUS_PARAM_TAGS.has(name)))
// Теги вида <имя_с_подчёркиванием>, которые не считаем опечаткой в имени инструмента
const NON_TOOL_UNDERSCORE_TAGS = new Set(["task_progress", "environment_details"])

/**
 * [SKYCODE] Ответ модели без вызова инструмента — это ответ пользователю (как в Claude Code),
 * если в нём есть текст и нет следов сломанного вызова инструмента. Тогда ждём сообщения
 * пользователя, а не требуем «повтори с инструментом» (лишний запрос и повтор того же ответа).
 * Сломанный вызов (`<read_file>` без закрытия, `<parameter=...>`, `<function=...>`) — по-прежнему
 * подсказка повторить: модель хотела действовать, а не отвечать.
 */
export function isTextOnlyAnswer(text: string): boolean {
	const visible = text
		.replace(/<task_progress>[\s\S]*?(<\/task_progress>|$)/g, "")
		.replace(/<think(ing)?>[\s\S]*?(<\/think(ing)?>|$)/g, "")
		.trim()
	if (!visible) {
		return false
	}
	if (/<(parameter|function)[=>]/.test(visible)) {
		return false
	}
	for (const match of visible.matchAll(/<\/?([a-zA-Z_]+)>/g)) {
		const tag = match[1]
		if (TOOL_NAMES.has(tag) || PARAM_TAGS.has(tag)) {
			return false
		}
		// Похоже на неверно написанное имя инструмента (<read_files>, <write_file>)
		if (/^[a-z]+_[a-z_]+$/.test(tag) && !NON_TOOL_UNDERSCORE_TAGS.has(tag)) {
			return false
		}
	}
	return true
}

/**
 * [SKYCODE] Короткий текст, который только объявляет следующее действие («Начну с чтения файлов…»,
 * «Сейчас посмотрю…», «Let me check…») и не задаёт вопрос: модель собиралась вызвать инструмент
 * и забыла. Такой текст — не ответ пользователю, а повод подсказать продолжить.
 */
const INTENTION_PATTERNS = [
	/(^|[\s.!])(начну|начинаю|сейчас|теперь|далее|дальше|продолжаю|продолжу|посмотрю|проверю|изучу|прочитаю|найду|открою|запущу|нужно|надо|попробую|давай(те)?)(?=[\s.,:!—-]|$)/i,
	/(^|[\s.!])(let me|i'?ll|i will|now i|next,? i|i'?m going to|let's)\b/i,
]

export function isIntentionOnly(text: string): boolean {
	const visible = text
		.replace(/<task_progress>[\s\S]*?(<\/task_progress>|$)/g, "")
		.replace(/<think(ing)?>[\s\S]*?(<\/think(ing)?>|$)/g, "")
		.trim()
	if (!visible || visible.length > 400 || visible.includes("?")) {
		return false
	}
	// Решают два последних предложения: «…Начну с чтения файлов.» / «Продолжаю чтение файла: A.cs.»
	const sentences = visible.split(/(?<=[.!:])\s+/).filter(Boolean)
	const tail = sentences.slice(-2).join(" ") || visible
	return visible.endsWith(":") || INTENTION_PATTERNS.some((pattern) => pattern.test(tail))
}
