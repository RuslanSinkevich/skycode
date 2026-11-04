import { MemoryStore } from "@core/memory/MemoryStore"
import type { MemoryEntryView, MemoryListResponse } from "@shared/memory"
import { EmptyRequest, String as ProtoString } from "@shared/proto/skycode/common"
import * as path from "path"
import { getCwd } from "@/utils/path"
import { Controller } from ".."

const view = ({ id, type, text, status, created, updated }: MemoryEntryView): MemoryEntryView => ({
	id,
	type,
	text,
	status,
	created,
	updated,
})

/** [SKYCODE] Обе памяти (общая и текущего проекта) для вкладки «Память»; ответ — JSON MemoryListResponse. */
export async function getMemory(controller: Controller, _request: EmptyRequest): Promise<ProtoString> {
	const cwd = await getCwd("")
	const { global, project } = await MemoryStore.get().list(cwd)
	const response: MemoryListResponse = {
		enabled: controller.stateManager.getGlobalSettingsKey("memoryEnabled") === true,
		projectFolder: cwd ? path.basename(cwd) : undefined,
		global: global.map(view),
		project: cwd ? project.map(view) : [],
	}
	return ProtoString.create({ value: JSON.stringify(response) })
}
