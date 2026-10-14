import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { Controller } from ".."

/**
 * Report bug slash command logic
 */
export async function reportBug(controller: Controller, _request: StringRequest): Promise<Empty> {
	await controller.activeTask?.handleWebviewAskResponse("yesButtonClicked")
	return Empty.create()
}
