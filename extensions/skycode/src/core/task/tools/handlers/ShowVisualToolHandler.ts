import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { SkycodeDefaultTool } from "@shared/tools"
import type { ToolResponse } from "../../index"
import type { IPartialBlockHandler, IToolHandler } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

/** [SKYCODE] Полезная нагрузка say("visual"): JSON { title, content } в text */
export function buildVisualPayload(title: string, content: string): string {
	return JSON.stringify({ title: title.trim(), content })
}

/**
 * [SKYCODE] show_visual: показывает пользователю статичную HTML/SVG-визуализацию в чате.
 * Одобрение не нужно (только чтение). Скрипты в webview не исполняются.
 */
export class ShowVisualToolHandler implements IToolHandler, IPartialBlockHandler {
	readonly name = SkycodeDefaultTool.SHOW_VISUAL

	getDescription(block: ToolUse): string {
		return `[${block.name} for '${block.params.title}']`
	}

	// Пока блок не завершён, ничего не показываем
	async handlePartialBlock(_block: ToolUse, _uiHelpers: StronglyTypedUIHelpers): Promise<void> {}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const title: string | undefined = block.params.title
		const content: string | undefined = block.params.content

		if (!title) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "title")
		}
		if (!content) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "content")
		}
		config.taskState.consecutiveMistakeCount = 0

		await config.callbacks.say("visual", buildVisualPayload(title, content), undefined, undefined, false)

		return formatResponse.toolResult(`Visual "${title.trim()}" shown to the user.`)
	}
}
