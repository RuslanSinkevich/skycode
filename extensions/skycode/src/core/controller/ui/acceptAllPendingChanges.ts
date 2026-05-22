import type { Controller } from "@core/controller"
import { getDiffSystem } from "@core/diff-v2/DiffSystem"
import { Empty, EmptyRequest } from "@shared/proto/skycode/common"
import { Logger } from "@/shared/services/Logger"

/**
 * Accept all pending changes in the diff system.
 * Groups by file and processes bottom-to-top for consistency with rejectAll.
 */
export async function acceptAllPendingChanges(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	Logger.log("[acceptAllPendingChanges] Called")
	const diffSystem = getDiffSystem()
	const store = diffSystem.getStore()

	const count = store.getPendingCount()
	Logger.log("[acceptAllPendingChanges] Pending hunks:", count)

	if (count === 0) {
		return Empty.create({})
	}

	const files = store.getFilesWithPendingChanges()
	for (const fsPath of files) {
		await diffSystem.acceptAllForFile(fsPath)
	}

	await controller.postStateToWebview()

	return Empty.create({})
}
