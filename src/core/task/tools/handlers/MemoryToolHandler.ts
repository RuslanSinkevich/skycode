import type { ToolUse } from "@core/assistant-message"
import { extractUserWords, type MemoryEntry, scopeOfType } from "@core/memory/memory"
import { MemoryStore } from "@core/memory/MemoryStore"
import { formatResponse } from "@core/prompts/responses"
import type { MemorySayAction, MemorySayPayload } from "@shared/memory"
import { SkycodeDefaultTool } from "@shared/tools"
import { Logger } from "@/shared/services/Logger"
import type { ToolResponse } from "../../index"
import type { IPartialBlockHandler, IToolHandler } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

/**
 * Слова пользователя в этой задаче — только они основание для памяти. Берём из истории для модели,
 * а не из сообщений чата: там первое сообщение задачи хранится как say "text", как и ответы агента,
 * и в первом живом тесте дословная цитата из него не нашлась.
 */
function userTextsOf(config: TaskConfig): string[] {
	const raw: string[] = []
	for (const message of config.messageState.getApiConversationHistory()) {
		if (message.role !== "user") {
			continue
		}
		if (typeof message.content === "string") {
			raw.push(message.content)
			continue
		}
		for (const block of message.content) {
			if (block.type === "text") {
				raw.push(block.text)
			} else if (block.type === "tool_result") {
				// нативные вызовы: ответ на ask_followup_question приходит результатом инструмента
				const content = block.content
				if (typeof content === "string") {
					raw.push(content)
				} else if (Array.isArray(content)) {
					for (const part of content) {
						if (part.type === "text") {
							raw.push(part.text)
						}
					}
				}
			}
		}
	}
	return extractUserWords(raw)
}

/** Служебная строка в чате: что сделано с памятью, с «Отменить» (core/controller/file/undoMemory.ts). */
async function sayMemory(config: TaskConfig, action: MemorySayAction, entry: MemoryEntry, previous?: MemoryEntry): Promise<void> {
	const payload: MemorySayPayload = {
		action,
		scope: scopeOfType(entry.type),
		entry: { ...entry },
		previous: previous ? { ...previous } : undefined,
	}
	await config.callbacks.say("memory", JSON.stringify(payload), undefined, undefined, false)
}

function memoryEnabled(config: TaskConfig): boolean {
	return config.services.stateManager.getGlobalSettingsKey("memoryEnabled") === true
}

/**
 * [SKYCODE] remember: модель сама решает, что запомнить; одобрение не спрашиваем, но после записи
 * в чате появляется служебная строка с «Отменить». Все рамки — в core/memory/memory.ts (applyRemember).
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

		const result = await MemoryStore.get().remember(
			{ fact, type, evidence },
			{ taskId: config.taskId, cwd: config.cwd, userTexts: userTextsOf(config) },
		)
		if (!result.ok) {
			Logger.log(`[Memory] not saved: ${result.reason}`)
			// Отказ — обычный ответ инструмента, а не ошибка: модель не должна «чинить» его повторами.
			return formatResponse.toolResult(`Not saved: ${result.reason}. Continue with the task.`)
		}

		const { entry, previous, action } = result
		await sayMemory(config, action, entry, previous)

		const how =
			action === "added"
				? `Saved as unconfirmed memory [${entry.id}]; it becomes confirmed after two more conversations.`
				: action === "confirmed"
					? `This repeats unconfirmed memory [${entry.id}], which is now confirmed.`
					: `Updated memory [${entry.id}].`
		// Строка в чате уже показала запись — модели не нужно пересказывать её текстом.
		return formatResponse.toolResult(`${how} The user sees this in the chat; do not repeat it in your reply.`)
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
		const removed = await MemoryStore.get().forget(id, config.cwd)
		if (!removed) {
			return formatResponse.toolResult(`No memory entry with id ${id}.`)
		}
		await sayMemory(config, "forgot", removed)
		return formatResponse.toolResult(`Forgot [${id}]: ${removed.text}`)
	}
}
