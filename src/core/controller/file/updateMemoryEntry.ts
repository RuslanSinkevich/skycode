import { MemoryStore } from "@core/memory/MemoryStore"
import { String as ProtoString, StringRequest } from "@shared/proto/skycode/common"
import { getCwd } from "@/utils/path"
import { Controller } from ".."

/**
 * [SKYCODE] Правка текста записи из вкладки «Память». Запрос — JSON { id, text }.
 * Ответ — пустая строка при успехе или причина отказа ("too long", "secret", "empty", "not found").
 */
export async function updateMemoryEntry(_controller: Controller, request: StringRequest): Promise<ProtoString> {
	let id = ""
	let text = ""
	try {
		const data = JSON.parse(request.value || "{}") as { id?: unknown; text?: unknown }
		id = typeof data.id === "string" ? data.id : ""
		text = typeof data.text === "string" ? data.text : ""
	} catch {
		return ProtoString.create({ value: "bad request" })
	}
	const result = await MemoryStore.get().edit(id, text, await getCwd(""))
	return ProtoString.create({ value: result.ok ? "" : result.reason })
}
