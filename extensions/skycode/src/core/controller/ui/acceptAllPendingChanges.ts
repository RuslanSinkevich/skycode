import type { Controller } from "@core/controller"
import { getDiffSystem } from "@core/diff-v2/DiffSystem"
import { Empty, EmptyRequest } from "@shared/proto/skycode/common"
import { Logger } from "@/shared/services/Logger"

/**
 * Accept all pending changes in the diff system.
 * Groups by file and processes bottom-to-top for consistency with rejectAll.
 *
 * [SKYCODE] Область — текущая задача: кнопка стоит в баре, а бар показывает только её файлы,
 * поэтому «принять всё» не должно затрагивать правки других вкладок. Оговорка: приём идёт
 * пофайлово (acceptAllForFile сам держит порядок строк), так что если один файл правили
 * агенты двух задач, будут приняты оба набора хунков в этом файле.
 */
export async function acceptAllPendingChanges(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	Logger.log("[acceptAllPendingChanges] Called")
	const diffSystem = getDiffSystem()
	const store = diffSystem.getStore()
	const taskId = controller.task?.taskId

	const count = store.getPendingCount(taskId)
	Logger.log("[acceptAllPendingChanges] Pending hunks:", count, "taskId:", taskId)

	if (count === 0) {
		return Empty.create({})
	}

	const files = store.getFilesWithPendingChanges(taskId)
	for (const fsPath of files) {
		await diffSystem.acceptAllForFile(fsPath)
	}

	await controller.postStateToWebview()

	return Empty.create({})
}
