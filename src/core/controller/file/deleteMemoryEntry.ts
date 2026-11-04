import { MemoryStore } from "@core/memory/MemoryStore"
import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { getCwd } from "@/utils/path"
import { Controller } from ".."

/** [SKYCODE] Удаление записи памяти из вкладки «Память» (по id, в любой из двух памятей). */
export async function deleteMemoryEntry(_controller: Controller, request: StringRequest): Promise<Empty> {
	if (request.value) {
		await MemoryStore.get().forget(request.value, await getCwd(""))
	}
	return Empty.create()
}
