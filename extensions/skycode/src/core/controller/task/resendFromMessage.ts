import { Empty } from "@shared/proto/skycode/common"
import { ResendFromMessageRequest } from "@shared/proto/skycode/task"
import { SkycodeApiReqInfo } from "@shared/ExtensionMessage"
import { getApiMetrics } from "@shared/getApiMetrics"
import { combineApiRequests } from "@shared/combineApiRequests"
import { combineCommandSequences } from "@shared/combineCommandSequences"
import pWaitFor from "p-wait-for"
import { Controller } from ".."
import { Logger } from "@/shared/services/Logger"

/**
 * Atomic "edit and resend": truncates history at messageTs, rolls back file
 * changes, then sends the edited text. The chat UI sees a single state update
 * (the new turn) instead of two — fixes the down-then-up scroll jitter caused
 * by calling deleteFromMessage + sendMessage separately from the webview.
 */
export async function resendFromMessage(controller: Controller, request: ResendFromMessageRequest): Promise<Empty> {
	const messageTs = Number(request.messageTs)
	const newText = request.text || ""
	const newImages = request.images || []
	const newFiles = request.files || []

	Logger.log(`[resendFromMessage] ===== START ===== ts=${messageTs}`)

	// 1. Rollback file changes (non-blocking)
	try {
		const { getDiffSystem } = await import("@core/diff-v2")
		const diffSystem = getDiffSystem()
		const reverted = await diffSystem.rollbackFromMessage(messageTs)
		Logger.log(`[resendFromMessage] Reverted ${reverted.length} checkpoints`)
	} catch (error) {
		Logger.error("[resendFromMessage] DiffSystem rollback failed (continuing):", error)
	}

	// 2. Truncate skycodeMessages and API history
	if (controller.task) {
		const messageStateHandler = controller.task.messageStateHandler
		const skycodeMessages = messageStateHandler.getSkycodeMessages()
		const messageIndex = skycodeMessages.findIndex((m) => m.ts === messageTs)

		if (messageIndex !== -1) {
			const deletedMessages = skycodeMessages.slice(messageIndex)
			const deletedApiReqsMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(deletedMessages)))

			const messagesToKeep = skycodeMessages.slice(0, messageIndex)

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
			}

			await messageStateHandler.overwriteSkycodeMessages(messagesToKeep)

			const targetMessage = skycodeMessages[messageIndex]
			const apiHistoryIndex = targetMessage.conversationHistoryIndex
			if (apiHistoryIndex !== undefined && apiHistoryIndex >= 0) {
				const apiHistory = messageStateHandler.getApiConversationHistory()
				const apiHistoryToKeep = apiHistory.slice(0, apiHistoryIndex)
				await messageStateHandler.overwriteApiConversationHistory(apiHistoryToKeep)
			}
		} else {
			Logger.error(`[resendFromMessage] Message ts=${messageTs} NOT FOUND`)
		}
	}

	// 3. Cancel task — aborts current run, re-inits from truncated history
	await controller.cancelTask()

	// 4. Wait for task to be ready for input, then send EDITED text
	if (controller.task) {
		try {
			await pWaitFor(
				() => controller.task?.taskState.isInitialized === true && controller.task?.approvalGate.hasPending === true,
				{ timeout: 5_000 },
			)
			Logger.log(`[resendFromMessage] Task ready, sending edited text: "${newText.substring(0, 60)}"`)
			await controller.task.handleWebviewAskResponse("messageResponse", newText, newImages, newFiles)
		} catch (error) {
			Logger.error("[resendFromMessage] Failed to auto-resume:", error)
		}
	}

	Logger.log(`[resendFromMessage] ===== END =====`)
	return Empty.create({})
}
