import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { Controller } from ".."

/**
 * [SKYCODE] Closes the tab (session); the task stays in history
 */
export async function closeTab(controller: Controller, request: StringRequest): Promise<Empty> {
	await controller.closeSession(request.value)
	await controller.postStateToWebview()
	return Empty.create()
}
