// [SKYCODE] Мягкая детекция повторов: одинаковый вызов инструмента без изменений между ними.

const MAX_RECENT_SIGNATURES = 8

// Инструменты, после которых результаты прежних вызовов могут измениться
const MODIFYING_TOOLS = new Set([
	"write_to_file",
	"replace_in_file",
	"replace_text",
	"delete_block",
	"apply_patch",
	"execute_command",
])

// Эти вызовы повторять законно (опрос фона, завершение, диалог с пользователем)
const REPEAT_EXEMPT_TOOLS = new Set([
	"attempt_completion",
	"ask_followup_question",
	"show_visual",
	"plan_mode_respond",
	"act_mode_respond",
	"check_background_command",
	// read_file сам сверяет содержимое файла и отвечает «не менялся» точно
	"read_file",
])

/** Сигнатура вызова: имя + JSON параметров с отсортированными ключами, без task_progress */
export function toolCallSignature(name: string, params: Record<string, unknown> | undefined): string {
	const normalized: Record<string, unknown> = {}
	for (const key of Object.keys(params ?? {}).sort()) {
		if (key === "task_progress") {
			continue
		}
		normalized[key] = params?.[key]
	}
	return `${name}:${JSON.stringify(normalized)}`
}

/**
 * Регистрирует вызов в списке последних сигнатур (мутирует список).
 * Возвращает true, если точно такой же вызов уже был и ничего не менялось.
 */
export function registerToolCall(recent: string[], name: string, params: Record<string, unknown> | undefined): boolean {
	if (MODIFYING_TOOLS.has(name)) {
		recent.length = 0
		return false
	}
	if (REPEAT_EXEMPT_TOOLS.has(name)) {
		return false
	}
	const signature = toolCallSignature(name, params)
	const isRepeat = recent.includes(signature)
	if (isRepeat) {
		// Освежаем позицию, чтобы свежий повтор не вытеснился раньше времени
		recent.splice(recent.indexOf(signature), 1)
	}
	recent.push(signature)
	while (recent.length > MAX_RECENT_SIGNATURES) {
		recent.shift()
	}
	return isRepeat
}

export function repeatNote(name: string): string {
	return `[REPEAT] You already made this exact ${name} call a moment ago. Unless something changed since, the result is the same as before — use that earlier result, or try a different approach.`
}
