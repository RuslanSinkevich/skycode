import fs from "fs/promises"
import path from "path"
import * as vscode from "vscode"
import { HistoryItem } from "@/shared/HistoryItem"
import { Logger } from "@/shared/services/Logger"
import { ensureRulesDirectoryExists, readTaskHistoryFromState, writeTaskHistoryToState } from "./disk"

export async function migrateTaskHistoryToFile(context: vscode.ExtensionContext) {
	try {
		// Get data from old location
		const vscodeGlobalStateTaskHistory = context.globalState.get<HistoryItem[] | undefined>("taskHistory")

		// Normalize old location data to array (empty array if undefined/null/not-array)
		const oldLocationData = Array.isArray(vscodeGlobalStateTaskHistory) ? vscodeGlobalStateTaskHistory : []

		// Early return if no migration needed
		if (oldLocationData.length === 0) {
			Logger.log("[Storage Migration] No task history to migrate")
			return
		}

		let finalData: HistoryItem[]
		let migrationAction: string

		const newLocationData = await readTaskHistoryFromState()

		if (newLocationData.length === 0) {
			// Move old data to new location
			finalData = oldLocationData
			migrationAction = "Migrated task history from old location to new location"
		} else {
			// Merge old data (more recent) with new data
			finalData = [...newLocationData, ...oldLocationData]
			migrationAction = "Merged task history from old and new locations"
		}

		// Perform migration operations sequentially - only clear old data if write succeeds
		await writeTaskHistoryToState(finalData)

		const successfullyWrittenData = await readTaskHistoryFromState()

		if (!Array.isArray(successfullyWrittenData)) {
			Logger.error("[Storage Migration] Failed to write taskHistory to file: Written data is not an array")
			return
		}

		if (successfullyWrittenData.length !== finalData.length) {
			Logger.error(
				"[Storage Migration] Failed to write taskHistory to file: Written data does not match the old location data",
			)
			return
		}

		await context.globalState.update("taskHistory", undefined)

		Logger.log(`[Storage Migration] ${migrationAction}`)
	} catch (error) {
		Logger.error("[Storage Migration] Failed to migrate task history to file:", error)
	}
}

export async function migrateCustomInstructionsToGlobalRules(context: vscode.ExtensionContext) {
	try {
		const customInstructions = (await context.globalState.get("customInstructions")) as string | undefined

		if (customInstructions?.trim()) {
			Logger.log("Migrating custom instructions to global Skycode rules...")

			// Create global .skycoderules directory if it doesn't exist
			const globalRulesDir = await ensureRulesDirectoryExists()

			// Use a fixed filename for custom instructions
			const migrationFileName = "custom_instructions.md"
			const migrationFilePath = path.join(globalRulesDir, migrationFileName)

			try {
				// Check if file already exists to determine if we should append
				let existingContent = ""
				try {
					existingContent = await fs.readFile(migrationFilePath, "utf8")
				} catch (_readError) {
					// File doesn't exist, which is fine
				}

				// Append or create the file with custom instructions
				const contentToWrite = existingContent
					? `${existingContent}\n\n---\n\n${customInstructions.trim()}`
					: customInstructions.trim()

				await fs.writeFile(migrationFilePath, contentToWrite)
				Logger.log(`Successfully ${existingContent ? "appended to" : "created"} migration file: ${migrationFilePath}`)
			} catch (fileError) {
				Logger.error("Failed to write migration file:", fileError)
				return
			}

			// Remove customInstructions from global state only after successful file creation
			await context.globalState.update("customInstructions", undefined)
			Logger.log("Successfully migrated custom instructions to global Skycode rules")
		}
	} catch (error) {
		Logger.error("Failed to migrate custom instructions to global rules:", error)
		// Continue execution - migration failure shouldn't break extension startup
	}
}

export async function cleanupMcpMarketplaceCatalogFromGlobalState(context: vscode.ExtensionContext) {
	try {
		// Check if mcpMarketplaceCatalog exists in global state
		const mcpMarketplaceCatalog = await context.globalState.get("mcpMarketplaceCatalog")

		if (mcpMarketplaceCatalog !== undefined) {
			Logger.log("Cleaning up mcpMarketplaceCatalog from global state...")

			// Delete it from global state
			await context.globalState.update("mcpMarketplaceCatalog", undefined)

			Logger.log("Successfully removed mcpMarketplaceCatalog from global state")
		}
	} catch (error) {
		Logger.error("Failed to cleanup mcpMarketplaceCatalog from global state:", error)
		// Continue execution - cleanup failure shouldn't break extension startup
	}
}
