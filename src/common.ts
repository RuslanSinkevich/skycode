import * as vscode from "vscode"
import {
	cleanupMcpMarketplaceCatalogFromGlobalState,
	migrateCustomInstructionsToGlobalRules,
	migrateTaskHistoryToFile,
} from "./core/storage/state-migrations"
import { WebviewProvider } from "./core/webview"
import "./utils/path" // necessary to have access to String.prototype.toPosix

import { HostProvider } from "@/hosts/host-provider"
import { Logger } from "@/shared/services/Logger"
import { FileContextTracker } from "./core/context/context-tracking/FileContextTracker"
import { StateManager } from "./core/storage/StateManager"
import { openAiCodexOAuthManager } from "./integrations/openai-codex/oauth"
import { audioRecordingService } from "./services/dictation/AudioRecordingService"
import { getSherpaDictationService } from "./services/dictation/SherpaDictationService"
import { initializeDistinctId } from "./services/logging/distinctId"
import { ShowMessageType } from "./shared/proto/host/window"
/**
 * Performs intialization for Skycode that is common to all platforms.
 *
 * @param context
 * @returns The webview provider
 */
export async function initialize(context: vscode.ExtensionContext): Promise<WebviewProvider> {
	// Configure the shared Logging class to use HostProvider's output channel
	Logger.setOutput((msg: string) => HostProvider.get().logToChannel(msg))

	const runInBackground = (label: string, task: () => Promise<unknown>) => {
		task().catch((error) => {
			Logger.warn(`[Startup] ${label} failed:`, error)
		})
	}

	try {
		await StateManager.initialize(context)
	} catch (error) {
		Logger.error("[Controller] CRITICAL: Failed to initialize StateManager - extension may not function properly:", error)
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: "Failed to initialize Skycode's application state. Please restart the extension.",
		})
	}

	// Initialize OpenAI Codex OAuth manager with extension context for secrets storage
	openAiCodexOAuthManager.initialize(context)

	// Set the distinct ID used for logging
	await initializeDistinctId(context)

	const webview = HostProvider.get().createWebviewProvider()

	// Keep the webview activation path short: nothing below may hold the Chat panel blank.
	runInBackground("state migrations", async () => {
		await migrateCustomInstructionsToGlobalRules(context)
		await migrateTaskHistoryToFile(context)
		await cleanupMcpMarketplaceCatalogFromGlobalState(context)
	})
	runInBackground("FileContextTracker.cleanupOrphanedWarnings", () => FileContextTracker.cleanupOrphanedWarnings(context))

	return webview
}

/**
 * Performs cleanup when Skycode is deactivated that is common to all platforms.
 */
export async function tearDown(): Promise<void> {
	// Clean up audio recording service to ensure no orphaned processes
	audioRecordingService.cleanup()
	// [SKYCODE] Выгружаем воркер диктовки GigaAM
	await getSherpaDictationService().dispose()

	// Dispose all webview instances
	await WebviewProvider.disposeAllInstances()
}
