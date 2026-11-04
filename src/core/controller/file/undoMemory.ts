import { type MemoryEntry } from "@core/memory/memory"
import { MemoryStore } from "@core/memory/MemoryStore"
import { parseMemorySayPayload } from "@shared/memory"
import { Empty, Int64Request } from "@shared/proto/skycode/common"
import { Logger } from "@/shared/services/Logger"
import { getCwd } from "@/utils/path"
import { Controller } from ".."

/**
 * [SKYCODE] «Отменить» в служебной строке памяти. Ищет сообщение say("memory") с этим ts во всех вкладках,
 * откатывает действие (новая запись — удалить, обновление — вернуть прежний текст, удаление — вернуть запись)
 * и помечает строку как отменённую, чтобы после перезагрузки кнопка не появлялась снова.
 */
export async function undoMemory(controller: Controller, request: Int64Request): Promise<Empty> {
	const ts = Number(request.value)
	for (const session of controller.sessionManager.getAll()) {
		const task = session.task
		if (!task) {
			continue
		}
		const messages = task.messageStateHandler.getSkycodeMessages()
		const index = messages.findIndex((m) => m.ts === ts && m.type === "say" && m.say === "memory")
		if (index === -1) {
			continue
		}
		const payload = parseMemorySayPayload(messages[index].text)
		if (!payload || payload.undone) {
			return Empty.create()
		}
		const store = MemoryStore.get()
		const cwd = await getCwd("")
		const entry = payload.entry as unknown as MemoryEntry
		try {
			if (payload.action === "forgot") {
				await store.restore(entry, cwd)
			} else if (payload.previous) {
				await store.restore(payload.previous as unknown as MemoryEntry, cwd)
			} else {
				await store.forget(entry.id, cwd)
			}
		} catch (error) {
			Logger.error("[Memory] undo failed", error)
			return Empty.create()
		}
		await task.messageStateHandler.updateSkycodeMessage(index, { text: JSON.stringify({ ...payload, undone: true }) })
		await controller.postStateToWebview()
		return Empty.create()
	}
	return Empty.create()
}
