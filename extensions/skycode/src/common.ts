import * as vscode from "vscode"
import {
	cleanupMcpMarketplaceCatalogFromGlobalState,
	migrateCustomInstructionsToGlobalRules,
	migrateTaskHistoryToFile,
	migrateWelcomeViewCompleted,
	migrateWorkspaceToGlobalStorage,
} from "./core/storage/state-migrations"
import { WebviewProvider } from "./core/webview"
import "./utils/path" // necessary to have access to String.prototype.toPosix

import { HostProvider } from "@/hosts/host-provider"
import { Logger } from "@/shared/services/Logger"
import { FileContextTracker } from "./core/context/context-tracking/FileContextTracker"
import { StateManager } from "./core/storage/StateManager"
import { openAiCodexOAuthManager } from "./integrations/openai-codex/oauth"
import { ExtensionRegistryInfo } from "./registry"
import { audioRecordingService } from "./services/dictation/AudioRecordingService"
import { getDistinctId, initializeDistinctId } from "./services/logging/distinctId"
import { ShowMessageType } from "./shared/proto/host/window"
import { syncWorker } from "./shared/services/worker/sync"
import { getBlobStoreSettingsFromEnv } from "./shared/services/worker/worker"
import { getLatestAnnouncementId } from "./utils/announcements"
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
		await migrateWelcomeViewCompleted(context)
		await migrateWorkspaceToGlobalStorage(context)
		await migrateTaskHistoryToFile(context)
		await cleanupMcpMarketplaceCatalogFromGlobalState(context)
	})
	runInBackground("FileContextTracker.cleanupOrphanedWarnings", () => FileContextTracker.cleanupOrphanedWarnings(context))
	runInBackground("showVersionUpdateAnnouncement", () => showVersionUpdateAnnouncement(context))

	// Use remote config blobStoreConfig if available, otherwise fall back to env vars
	const blobStoreSettings = StateManager.get().getRemoteConfigSettings()?.blobStoreConfig ?? getBlobStoreSettingsFromEnv()
	syncWorker().init({ ...blobStoreSettings, userDistinctId: getDistinctId() })

	return webview
}

async function showVersionUpdateAnnouncement(context: vscode.ExtensionContext) {
	// Version checking for autoupdate notification
	const currentVersion = ExtensionRegistryInfo.version
	const previousVersion = context.globalState.get<string>("skycodeVersion")
	// Perform post-update actions if necessary
	try {
		if (!previousVersion || currentVersion !== previousVersion) {
			Logger.log(`Skycode version changed: ${previousVersion} -> ${currentVersion}. First run or update detected.`)

			// Check if there's a new announcement to show
			const lastShownAnnouncementId = context.globalState.get<string>("lastShownAnnouncementId")
			const latestAnnouncementId = getLatestAnnouncementId()

			if (lastShownAnnouncementId !== latestAnnouncementId) {
				// Show notification when there's a new announcement (major/minor updates or fresh installs)
				const message = previousVersion
					? `Skycode has been updated to v${currentVersion}`
					: `Welcome to Skycode v${currentVersion}`
				HostProvider.window.showMessage({
					type: ShowMessageType.INFORMATION,
					message,
				})
			}
			// Always update the main version tracker for the next launch.
			await context.globalState.update("skycodeVersion", currentVersion)
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		Logger.error(`Error during post-update actions: ${errorMessage}, Stack trace: ${error.stack}`)
	}
}

/**
 * Performs cleanup when Skycode is deactivated that is common to all platforms.
 */
export async function tearDown(): Promise<void> {
	// Clean up audio recording service to ensure no orphaned processes
	audioRecordingService.cleanup()

	// Dispose all webview instances
	await WebviewProvider.disposeAllInstances()
	syncWorker().dispose()
}
