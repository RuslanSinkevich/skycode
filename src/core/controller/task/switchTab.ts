import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { Controller } from ".."

/**
 * [SKYCODE] Makes the tab (session) with the given id active
 */
export async function switchTab(controller: Controller, request: StringRequest): Promise<Empty> {
	await controller.switchSession(request.value)
	await controller.postStateToWebview()
	return Empty.create()
}
