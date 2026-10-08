import { Empty } from "@shared/proto/skycode/common"
import { Int64Request } from "@shared/proto/skycode/common"
import { SkycodeApiReqInfo } from "@shared/ExtensionMessage"
import { getApiMetrics } from "@shared/getApiMetrics"
import { combineApiRequests } from "@shared/combineApiRequests"
import { combineCommandSequences } from "@shared/combineCommandSequences"
import pWaitFor from "p-wait-for"
import { Controller } from ".."
import { Logger } from "@/shared/services/Logger"

/**
 * Retries from a specific message: reverts all file changes from that message onwards,
 * deletes subsequent chat history, and resends the original message to the AI.
 *
 * Flow:
 * 1. Save original message text
 * 2. Truncate skycodeMessages and API history (persisted to disk)
 * 3. Preserve cost/token metrics from deleted messages as deleted_api_reqs
 * 4. cancelTask() — aborts the running task, re-inits from truncated history, shows resume UI
 * 5. Wait for the re-initialized task to have a pending ask (resume prompt)
 * 6. Auto-respond with the original message text
 */
export async function retryFromMessage(controller: Controller, request: Int64Request): Promise<Empty> {
	const messageTs = Number(request.value)

	Logger.log(`[retryFromMessage] ===== START ===== ts=${messageTs}`)

	// 0. Get the original message text before anything else
	let originalMessageText = ""
	let originalImages: string[] = []
	let originalFiles: string[] = []

	if (controller.task) {
		const messageStateHandler = controller.task.messageStateHandler
		const skycodeMessages = messageStateHandler.getSkycodeMessages()

		Logger.log(`[retryFromMessage] Total skycodeMessages: ${skycodeMessages.length}`)

		const message = skycodeMessages.find((m) => m.ts === messageTs)

		if (message) {
			originalMessageText = message.text || ""
			originalImages = message.images || []
			originalFiles = message.files || []
			Logger.log(`[retryFromMessage] Found message (say=${message.say}): "${originalMessageText.substring(0, 60)}"`)
		} else {
			Logger.error(`[retryFromMessage] Message ts=${messageTs} NOT FOUND`)
		}
	}

	// 1. Try to rollback file changes (non-blocking)
	try {
		const { getDiffSystem } = await import("@core/diff-v2")
		const diffSystem = getDiffSystem()
		const revertedCheckpoints = await diffSystem.rollbackFromMessage(messageTs)
		Logger.log(`[retryFromMessage] Reverted ${revertedCheckpoints.length} checkpoints`)
	} catch (error) {
		Logger.error("[retryFromMessage] DiffSystem rollback failed (continuing):", error)
	}

	// 2. Truncate skycodeMessages and API history (persist to disk)
	if (controller.task) {
		const messageStateHandler = controller.task.messageStateHandler
		const skycodeMessages = messageStateHandler.getSkycodeMessages()

		const messageIndex = skycodeMessages.findIndex((m) => m.ts === messageTs)
		Logger.log(`[retryFromMessage] messageIndex: ${messageIndex}`)

		if (messageIndex !== -1) {
			// Aggregate cost/token metrics from messages being deleted
			// so the total cost display remains accurate (money already spent)
			const deletedMessages = skycodeMessages.slice(messageIndex)
			const deletedApiReqsMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(deletedMessages)))

			// Keep messages before this one
			const messagesToKeep = skycodeMessages.slice(0, messageIndex)

			// If deleted messages had any cost, preserve it as a deleted_api_reqs message
			if (
				deletedApiReqsMetrics.totalCost > 0 ||
				deletedApiReqsMetrics.totalTokensIn > 0 ||
				deletedApiReqsMetrics.totalTokensOut > 0
			) {
				messagesToKeep.push({
					ts: Date.now(),
					type: "say",
					say: "deleted_api_reqs",
					text: JSON.stringify({
						tokensIn: deletedApiReqsMetrics.totalTokensIn,
						tokensOut: deletedApiReqsMetrics.totalTokensOut,
						cacheWrites: deletedApiReqsMetrics.totalCacheWrites,
						cacheReads: deletedApiReqsMetrics.totalCacheReads,
						cost: deletedApiReqsMetrics.totalCost,
					} satisfies SkycodeApiReqInfo),
				})
				Logger.log(
					`[retryFromMessage] Preserved deleted metrics: cost=${deletedApiReqsMetrics.totalCost}, tokensIn=${deletedApiReqsMetrics.totalTokensIn}, tokensOut=${deletedApiReqsMetrics.totalTokensOut}`,
				)
			}

			await messageStateHandler.overwriteSkycodeMessages(messagesToKeep)
			Logger.log(`[retryFromMessage] Truncated skycodeMessages: ${skycodeMessages.length} -> ${messagesToKeep.length}`)

			// Truncate API history
			const targetMessage = skycodeMessages[messageIndex]
			const apiHistoryIndex = targetMessage.conversationHistoryIndex
			if (apiHistoryIndex !== undefined && apiHistoryIndex >= 0) {
				const apiHistory = messageStateHandler.getApiConversationHistory()
				const apiHistoryToKeep = apiHistory.slice(0, apiHistoryIndex)
				await messageStateHandler.overwriteApiConversationHistory(apiHistoryToKeep)
				Logger.log(`[retryFromMessage] Truncated API history: ${apiHistory.length} -> ${apiHistoryToKeep.length}`)
			}
		} else {
			Logger.error(`[retryFromMessage] Message not found for truncation`)
		}
	}

	// 3. Cancel the current task — aborts it, re-initializes from the truncated history on disk
	Logger.log(`[retryFromMessage] Calling cancelTask()...`)
	await controller.cancelTask()
	Logger.log(`[retryFromMessage] cancelTask() done. task exists: ${!!controller.task}`)

	// 4. Wait for the re-initialized task to have a pending ask (resume prompt)
	if (originalMessageText && controller.task) {
		try {
			await pWaitFor(
				() => controller.task?.taskState.isInitialized === true && controller.task?.approvalGate.hasPending === true,
				{ timeout: 5_000 },
			)
			Logger.log(`[retryFromMessage] Task ready, auto-responding with: "${originalMessageText.substring(0, 50)}"`)

			// 5. Auto-respond to the resume ask with the original message
			await controller.task.handleWebviewAskResponse("messageResponse", originalMessageText, originalImages, originalFiles)
		} catch (error) {
			Logger.error("[retryFromMessage] Failed to auto-resume:", error)
		}
	} else {
		Logger.log(`[retryFromMessage] No original text or no task, skipping auto-resend`)
	}

	Logger.log(`[retryFromMessage] ===== END =====`)
	return Empty.create({})
}
