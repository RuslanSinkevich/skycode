import type { ToolUse } from "@core/assistant-message"
import { MemoryStore } from "@core/memory/MemoryStore"
import { formatResponse } from "@core/prompts/responses"
import { HostProvider } from "@hosts/host-provider"
import { ShowMessageType } from "@shared/proto/host/window"
import { SkycodeDefaultTool } from "@shared/tools"
import { t } from "@/i18n/backend-i18n"
import { Logger } from "@/shared/services/Logger"
import type { ToolResponse } from "../../index"
import type { IPartialBlockHandler, IToolHandler } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

/** Слова пользователя в этой задаче: первое сообщение и все ответы. Только они — основание для памяти. */
function userTextsOf(config: TaskConfig): string[] {
	return config.messageState
		.getSkycodeMessages()
		.filter((m) => m.type === "say" && (m.say === "task" || m.say === "user_feedback") && typeof m.text === "string")
		.map((m) => m.text as string)
}

function memoryEnabled(config: TaskConfig): boolean {
	return config.services.stateManager.getGlobalSettingsKey("memoryEnabled") === true
}

/**
 * [SKYCODE] remember: модель сама решает, что запомнить; одобрение не спрашиваем, но после записи
 * показываем уведомление с «Отменить». Все рамки — в core/memory/memory.ts (applyRemember).
 */
export class RememberToolHandler implements IToolHandler, IPartialBlockHandler {
	readonly name = SkycodeDefaultTool.MEMORY_REMEMBER

	getDescription(block: ToolUse): string {
		return `[${block.name} '${block.params.fact ?? ""}']`
	}

	async handlePartialBlock(_block: ToolUse, _uiHelpers: StronglyTypedUIHelpers): Promise<void> {}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		if (!memoryEnabled(config)) {
			return formatResponse.toolError("Memory is turned off in settings.")
		}
		const fact = block.params.fact
		const type = block.params.type
		const evidence = block.params.evidence
		if (!fact) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "fact")
		}
		if (!type) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "type")
		}
		if (!evidence) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "evidence")
		}
		config.taskState.consecutiveMistakeCount = 0

		const store = MemoryStore.get()
		const result = await store.remember(
			{ fact, type, evidence, scope: block.params.scope?.trim() === "project" ? "project" : "global" },
			{ taskId: config.taskId, cwd: config.cwd, userTexts: userTextsOf(config) },
		)
		if (!result.ok) {
			Logger.log(`[Memory] not saved: ${result.reason}`)
			// Отказ — обычный ответ инструмента, а не ошибка: модель не должна «чинить» его повторами.
			return formatResponse.toolResult(`Not saved: ${result.reason}. Continue with the task.`)
		}

		const { entry, previous, action } = result
		void HostProvider.window
			.showMessage({
				type: ShowMessageType.INFORMATION,
				message: t(action === "added" ? "memory.saved" : "memory.updated", { fact: entry.text }),
				options: { items: [t("memory.undo")] },
			})
			.then(async (choice) => {
				if (choice?.selectedOption !== t("memory.undo")) {
					return
				}
				if (previous) {
					await store.restore(previous)
				} else {
					await store.forget(entry.id)
				}
			})
			.catch((error) => Logger.error("[Memory] notification failed", error))

		const how =
			action === "added"
				? `Saved as unconfirmed memory [${entry.id}]; it becomes confirmed after two more conversations.`
				: action === "confirmed"
					? `This repeats unconfirmed memory [${entry.id}], which is now confirmed.`
					: `Updated memory [${entry.id}].`
		return formatResponse.toolResult(`${how} Tell the user in one short line what you remembered.`)
	}
}

export class ForgetToolHandler implements IToolHandler, IPartialBlockHandler {
	readonly name = SkycodeDefaultTool.MEMORY_FORGET

	getDescription(block: ToolUse): string {
		return `[${block.name} '${block.params.id ?? ""}']`
	}

	async handlePartialBlock(_block: ToolUse, _uiHelpers: StronglyTypedUIHelpers): Promise<void> {}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		if (!memoryEnabled(config)) {
			return formatResponse.toolError("Memory is turned off in settings.")
		}
		const id = block.params.id?.trim().replace(/^\[|\]$/g, "")
		if (!id) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "id")
		}
		config.taskState.consecutiveMistakeCount = 0
		const removed = await MemoryStore.get().forget(id)
		if (!removed) {
			return formatResponse.toolResult(`No memory entry with id ${id}.`)
		}
		return formatResponse.toolResult(`Forgot [${id}]: ${removed.text}`)
	}
}
