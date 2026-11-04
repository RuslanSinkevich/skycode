import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { Controller } from ".."

/**
 * [SKYCODE] Switches to the tab that holds the history task, or opens it in a new tab
 */
export async function openTaskInTab(controller: Controller, request: StringRequest): Promise<Empty> {
	await controller.openTaskInTab(request.value)
	await controller.postStateToWebview()
	return Empty.create()
}
