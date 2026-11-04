import { MemoryStore } from "@core/memory/MemoryStore"
import { openFile as openFileIntegration } from "@integrations/misc/open-file"
import { Empty, EmptyRequest } from "@shared/proto/skycode/common"
import { Controller } from ".."

/**
 * [SKYCODE] Opens the long-term memory file in the editor, creating an empty one if it does not exist yet.
 * The file is Documents/Skycode/Memory/memory.json; manual edits are picked up on the next request.
 */
export async function openMemoryFile(_controller: Controller, _request: EmptyRequest): Promise<Empty> {
	const filePath = await MemoryStore.get().ensureFile()
	await openFileIntegration(filePath)
	return Empty.create()
}
