import { SkycodeDefaultTool } from "@shared/tools"

const TOOL_NAMES = new Set<string>(Object.values(SkycodeDefaultTool))

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
	for (const match of visible.matchAll(/<\/?([a-z_]+)>/g)) {
		if (TOOL_NAMES.has(match[1])) {
			return false
		}
	}
	return true
}
