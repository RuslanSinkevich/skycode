import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { ToolResponse } from "../../index"
import type { IFullyManagedTool } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

export class CheckBackgroundCommandHandler implements IFullyManagedTool {
	readonly name = SkycodeDefaultTool.CHECK_BACKGROUND

	getDescription(block: ToolUse): string {
		const id = block.params.id
		return id ? `[check background command '${id}']` : "[check all background commands]"
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const partialMessage = JSON.stringify({
			tool: "check_background_command",
			id: block.params.id || "",
			content: "",
		})
		await uiHelpers.removeLastPartialMessageIfExistsWithType("ask", "tool")
		await uiHelpers.say("tool", partialMessage, undefined, undefined, block.partial)
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		config.taskState.consecutiveMistakeCount = 0

		try {
			const result = await config.callbacks.checkBackgroundCommand(block.params.id)

			const completeMessage = JSON.stringify({
				tool: "check_background_command",
				id: block.params.id || "",
				content: result,
			})
			await config.callbacks.removeLastPartialMessageIfExistsWithType("ask", "tool")
			await config.callbacks.say("tool", completeMessage, undefined, undefined, false)

			return result
		} catch (error) {
			const errorMsg = `Error checking background command: ${error instanceof Error ? error.message : String(error)}`
			return formatResponse.toolError(errorMsg)
		}
	}
}
