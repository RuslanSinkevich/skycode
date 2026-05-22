import type { Controller } from "@core/controller"
import { Empty, EmptyRequest } from "@shared/proto/skycode/common"
import { Logger } from "@/shared/services/Logger"
import { getDiffSystem } from "@/core/diff-v2"

/**
 * Navigate to the next pending diff hunk in the active editor
 */
export async function navigateNextHunk(_controller: Controller, _request: EmptyRequest): Promise<Empty> {
	Logger.log("[navigateNextHunk] Called")
	await getDiffSystem().navigateNextHunk()
	return Empty.create({})
}
