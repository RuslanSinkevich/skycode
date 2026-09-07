import type { Controller } from "@core/controller"
import { getDiffSystem } from "@core/diff-v2/DiffSystem"
import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { Logger } from "@/shared/services/Logger"

/**
 * Reject all pending Skycode diff hunks for a single file.
 * Used by the per-file trash button in the pending changes bar.
 */
export async function rejectPendingChangesForFile(controller: Controller, request: StringRequest): Promise<Empty> {
	const fsPath = request.value
	if (!fsPath) {
		return Empty.create({})
	}

	Logger.log(`[rejectPendingChangesForFile] Rejecting: ${fsPath}`)
	const diffSystem = getDiffSystem()

	try {
		await diffSystem.rejectAllForFile(fsPath)
	} catch (e) {
		Logger.error(`[rejectPendingChangesForFile] Failed for ${fsPath}`, e)
	}

	await controller.postStateToWebview()
	return Empty.create({})
}
