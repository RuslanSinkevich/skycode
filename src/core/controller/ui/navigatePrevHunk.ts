import type { Controller } from "@core/controller"
import { Empty, EmptyRequest } from "@shared/proto/skycode/common"
import { Logger } from "@/shared/services/Logger"
import { getDiffSystem } from "@/core/diff-v2"

/**
 * Navigate to the previous pending diff hunk in the active editor
 */
export async function navigatePrevHunk(_controller: Controller, _request: EmptyRequest): Promise<Empty> {
	Logger.log("[navigatePrevHunk] Called")
	await getDiffSystem().navigatePrevHunk()
	return Empty.create({})
}
