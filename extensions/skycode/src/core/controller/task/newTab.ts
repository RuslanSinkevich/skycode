import { Empty, EmptyRequest } from "@shared/proto/skycode/common"
import { Controller } from ".."

/**
 * [SKYCODE] Creates an empty session (tab) and makes it active; the next message starts the task in it
 */
export async function newTab(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	await controller.newTab()
	await controller.postStateToWebview()
	return Empty.create()
}
