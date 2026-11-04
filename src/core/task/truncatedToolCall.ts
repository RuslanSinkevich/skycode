/**
 * [SKYCODE] Инструменты, которые нельзя исполнять по оборванному вызову: файл записался бы
 * обрезанным, правка применилась бы наполовину, команда или путь удаления были бы недописаны.
 */
const TRUNCATION_SENSITIVE_TOOLS = new Set([
	"write_to_file",
	"replace_in_file",
	"new_rule",
	"apply_patch",
	"edit_notebook",
	"delete_block",
	"replace_text",
	"delete_file",
	"execute_command",
])

/**
 * Ответ модели оборвался (лимит длины ответа, разрыв соединения) посреди XML-вызова инструмента:
 * хотя бы у одного из уже начатых параметров нет закрывающего тега. Модели иногда не пишут
 * закрывающий тег самого инструмента — это не обрыв, если все параметры закрыты.
 */
export function isTruncatedToolCall(name: string, params: Record<string, unknown>, assistantText: string): boolean {
	if (!TRUNCATION_SENSITIVE_TOOLS.has(name)) {
		return false
	}
	const start = assistantText.lastIndexOf(`<${name}>`)
	if (start < 0) {
		return false
	}
	const tail = assistantText.slice(start)
	return Object.keys(params).some((param) => !tail.includes(`</${param}>`))
}

export const TRUNCATED_TOOL_NOTE_PREFIX = "[TRUNCATED]"

export function truncatedToolNote(toolNames: string[]): string {
	return `${TRUNCATED_TOOL_NOTE_PREFIX} Your previous response was cut off (output length limit) in the middle of ${toolNames.join(", ")}, so it was NOT executed and nothing was changed. Split the work into smaller steps: for an existing file use replace_in_file with a few small SEARCH/REPLACE blocks; for a long new file write a shorter first version with write_to_file and extend it with replace_in_file.`
}
