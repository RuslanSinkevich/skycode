import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { Controller } from ".."

/**
 * Command slash command logic
 */
export async function condense(controller: Controller, _request: StringRequest): Promise<Empty> {
	await controller.activeTask?.handleWebviewAskResponse("yesButtonClicked")
	return Empty.create()
}
