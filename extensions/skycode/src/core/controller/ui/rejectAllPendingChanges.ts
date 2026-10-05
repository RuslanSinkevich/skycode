import type { Controller } from "@core/controller"
import { getDiffSystem } from "@core/diff-v2/DiffSystem"
import { Empty, EmptyRequest } from "@shared/proto/skycode/common"
import { Logger } from "@/shared/services/Logger"

/**
 * Reject all pending changes in the diff system.
 * Delegates to DiffSystem.rejectAll() which groups hunks by file
 * and processes them bottom-to-top — safe for multi-hunk files.
 */
export async function rejectAllPendingChanges(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	Logger.log("[rejectAllPendingChanges] Called")
	const diffSystem = getDiffSystem()
	// [SKYCODE] Только текущая задача — см. комментарий в acceptAllPendingChanges.
	const taskId = controller.task?.taskId

	const count = diffSystem.getStore().getPendingCount(taskId)
	Logger.log("[rejectAllPendingChanges] Pending hunks:", count, "taskId:", taskId)

	if (count === 0) {
		return Empty.create({})
	}

	await diffSystem.rejectAll(taskId)

	await controller.postStateToWebview()

	return Empty.create({})
}
