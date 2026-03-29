import { processFilesIntoText } from "@integrations/misc/extract-text"
import { showSystemNotification } from "@integrations/notifications"
import { findLast, parsePartialArrayString } from "@shared/array"
import { SkycodeAsk, SkycodeAskQuestion } from "@shared/ExtensionMessage"
import { SkycodeDefaultTool } from "@shared/tools"
import { telemetryService } from "@/services/telemetry"
import { ToolUse } from "../../../assistant-message"
import { formatResponse } from "../../../prompts/responses"
import { ToolResponse } from "../.."
import type { IPartialBlockHandler, IToolHandler } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

export class AskFollowupQuestionToolHandler implements IToolHandler, IPartialBlockHandler {
	readonly name = SkycodeDefaultTool.ASK

	getDescription(block: ToolUse): string {
		return `[${block.name} for '${block.params.question}']`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const question = block.params.question || ""
		const optionsRaw = block.params.options || "[]"
		const sharedMessage = {
			question: uiHelpers.removeClosingTag(block, "question", question),
			options: parsePartialArrayString(uiHelpers.removeClosingTag(block, "options", optionsRaw)),
		} satisfies SkycodeAskQuestion

		await uiHelpers.ask("followup" as SkycodeAsk, JSON.stringify(sharedMessage), block.partial).catch(() => {})
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const question: string | undefined = block.params.question
		const optionsRaw: string | undefined = block.params.options

		// Validate required parameter
		if (!question) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "question")
		}
		config.taskState.consecutiveMistakeCount = 0

		// In yolo mode, don't wait for user input - instruct AI to use tools instead
		if (config.yoloModeToggled) {
			// Log the question that was asked but auto-respond
			await config.callbacks.say(
				"info",
				`[YOLO MODE] Auto-responding to question: "${question.substring(0, 100)}${question.length > 100 ? "..." : ""}"`,
			)

			return formatResponse.toolResult(
				`[YOLO MODE: User input is not available in non-interactive mode. You must use available tools (read_file, list_files, search_files, etc.) to gather the information you need instead of asking the user. Proceed with using tools to find the answer to your question: "${question}"]`,
			)
		}

		// Show notification if enabled
		if (config.autoApprovalSettings.enableNotifications) {
			showSystemNotification({
				subtitle: "Skycode has a question...",
				message: question.replace(/\n/g, " "),
			})
		}

		const sharedMessage = {
			question: question,
			options: parsePartialArrayString(optionsRaw || "[]"),
		} satisfies SkycodeAskQuestion

		const options = parsePartialArrayString(optionsRaw || "[]")

		// Ask the question
		const {
			text,
			images,
			files: followupFiles,
		} = await config.callbacks.ask("followup", JSON.stringify(sharedMessage), false)

		// Check if options contains the text response
		if (optionsRaw && text && options.includes(text)) {
			telemetryService.captureOptionSelected(config.ulid, options.length, "act")

			// Valid option selected, update last followup message with selected option
			const skycodeMessages = config.messageState.getSkycodeMessages()
			const lastFollowupMessage = findLast(skycodeMessages, (m: any) => m.ask === "followup")
			if (lastFollowupMessage) {
				lastFollowupMessage.text = JSON.stringify({
					...sharedMessage,
					selected: text,
				} satisfies SkycodeAskQuestion)
				await config.messageState.saveSkycodeMessagesAndUpdateHistory()
			}
		} else {
			// Option not selected, send user feedback
			telemetryService.captureOptionsIgnored(config.ulid, options.length, "act")
			await config.callbacks.say("user_feedback", text ?? "", images, followupFiles)
		}

		// Process any attached files
		let fileContentString = ""
		if (followupFiles && followupFiles.length > 0) {
			fileContentString = await processFilesIntoText(followupFiles)
		}

		return formatResponse.toolResult(`<answer>\n${text}\n</answer>`, images, fileContentString)
	}
}
