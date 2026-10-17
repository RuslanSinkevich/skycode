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
