import { String } from "@shared/proto/skycode/common"
import { NewTaskRequest } from "@shared/proto/skycode/task"
import { Controller } from ".."

/**
 * Creates a new task with the given text and optional images
 * @param controller The controller instance
 * @param request The new task request containing text and optional images
 * @returns Empty response
 */
export async function newTask(controller: Controller, request: NewTaskRequest): Promise<String> {
	const taskId = await controller.initTask(request.text, request.images, request.files)
	return String.create({ value: taskId || "" })
}
