import { MemoryStore } from "@core/memory/MemoryStore"
import { openFile as openFileIntegration } from "@integrations/misc/open-file"
import { Empty, EmptyRequest } from "@shared/proto/skycode/common"
import { getCwd } from "@/utils/path"
import { Controller } from ".."

/**
 * [SKYCODE] Opens both memory files in the editor — the shared one (Documents/Skycode/Memory/global.json)
 * and the one for the current workspace (projects/<folder>-<hash>.json), creating empty files if needed.
 * Manual edits are picked up on the next request.
 */
export async function openMemoryFile(_controller: Controller, _request: EmptyRequest): Promise<Empty> {
	const cwd = await getCwd("")
	const paths = await MemoryStore.get().ensureFiles(cwd || undefined)
	for (const filePath of paths) {
		await openFileIntegration(filePath)
	}
	return Empty.create()
}
