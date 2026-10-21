import type { WorkspaceRoot } from "@shared/multi-root/types"
import { HostProvider } from "@/hosts/host-provider"
import type { HistoryItem } from "@/shared/HistoryItem"
import { ShowMessageType } from "@/shared/proto/host/window"
import { Logger } from "@/shared/services/Logger"
import { getCwd, getDesktopDir } from "@/utils/path"
import { StateManager } from "../storage/StateManager"
import { isMultiRootEnabled } from "./multi-root-utils"
import { WorkspaceRootManager } from "./WorkspaceRootManager"

type DetectRoots = () => Promise<WorkspaceRoot[]>

/**
 * Initializes and persists the WorkspaceRootManager (multi-root or single-root),
 * and handles fallback on error.
 *
 * The caller injects detectRoots to avoid tight coupling to Controller.
 */
export async function setupWorkspaceManager({
	stateManager,
	detectRoots,
}: {
	stateManager: StateManager
	historyItem?: HistoryItem
	detectRoots: DetectRoots
}): Promise<WorkspaceRootManager> {
	const cwd = await getCwd(getDesktopDir())
	const multiRootEnabled = isMultiRootEnabled(stateManager)
	try {
		let manager: WorkspaceRootManager
		// Multi-root mode condition - requires both feature flag and user setting to be enabled
		if (multiRootEnabled) {
			// Multi-root: detect workspace folders
			const roots = await detectRoots()
			manager = new WorkspaceRootManager(roots, 0)
			Logger.log(`[WorkspaceManager] Multi-root mode: ${roots.length} roots detected`)

			// Persist
			stateManager.setGlobalState("workspaceRoots", manager.getRoots())
			stateManager.setGlobalState("primaryRootIndex", manager.getPrimaryIndex())
			return manager
		}

		manager = await WorkspaceRootManager.fromLegacyCwd(cwd)

		Logger.log(`[WorkspaceManager] Single-root mode: ${cwd}`)
		const roots = manager.getRoots()
		stateManager.setGlobalState("workspaceRoots", roots)
		stateManager.setGlobalState("primaryRootIndex", manager.getPrimaryIndex())
		return manager
	} catch (error) {
		// Graceful fallback to single-root from cwd
		Logger.error("[WorkspaceManager] Initialization failed:", error)
		const manager = await WorkspaceRootManager.fromLegacyCwd(cwd)
		const roots = manager.getRoots()
		stateManager.setGlobalState("workspaceRoots", roots)
		stateManager.setGlobalState("primaryRootIndex", manager.getPrimaryIndex())

		HostProvider.window.showMessage({
			type: ShowMessageType.WARNING,
			message: "Failed to initialize workspace. Using single folder mode.",
		})
		return manager
	}
}
