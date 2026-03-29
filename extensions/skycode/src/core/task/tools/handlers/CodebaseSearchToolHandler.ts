import type { ToolUse } from "@core/assistant-message"
import { SkycodeDefaultTool } from "@/shared/tools"
import { getSearchEngine } from "@/core/indexing/searchEngineInstance"
import type { ToolResponse } from "../../index"
import type { IFullyManagedTool } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

/**
 * Tool handler for semantic codebase search.
 * Delegates to the SearchEngine singleton initialized in extension.ts.
 */
export class CodebaseSearchToolHandler implements IFullyManagedTool {
	readonly name = SkycodeDefaultTool.CODEBASE_SEARCH

	getDescription(block: ToolUse): string {
		return `[semantic search for '${block.params.query}']`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const query = block.params.query
		const sharedMessageProps = {
			tool: "codebaseSearch",
			content: `Searching for: ${uiHelpers.removeClosingTag(block, "query", query)}`,
		}

		// Simple info message for partial state
		await uiHelpers.removeLastPartialMessageIfExistsWithType("ask", "tool")
		await uiHelpers.say("tool", JSON.stringify(sharedMessageProps), undefined, undefined, block.partial)
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const query: string | undefined = block.params.query
		const maxResultsParam: string | undefined = block.params.max_results
		const maxResults = maxResultsParam ? parseInt(maxResultsParam, 10) : 10

		if (!query) {
			return "Error: Missing required parameter 'query'."
		}

		const engine = getSearchEngine()
		if (!engine) {
			return "Error: Codebase indexing system is not initialized."
		}

		if (!engine.isReady()) {
			return "Error: Codebase index is not ready yet. Please wait for indexing to complete."
		}

		try {
			const context = await engine.getContextForPrompt(query, maxResults)

			if (!context) {
				return "No relevant code snippets found for this query."
			}

			// Show completion in UI
			const completeMessage = JSON.stringify({
				tool: "codebaseSearch",
				content: `Found relevant code for: ${query}`,
			})
			await config.callbacks.removeLastPartialMessageIfExistsWithType("ask", "tool")
			await config.callbacks.say("tool", completeMessage, undefined, undefined, false)

			return context
		} catch (error: any) {
			return `Error during semantic search: ${error.message}`
		}
	}
}
