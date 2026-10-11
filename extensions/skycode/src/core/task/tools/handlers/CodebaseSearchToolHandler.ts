import type { ToolUse } from "@core/assistant-message"
import { getSearchEngine } from "@/core/indexing/searchEngineInstance"
import { searchWithoutIndex } from "@/services/repo-map/searchWithoutIndex"
import { SkycodeDefaultTool } from "@/shared/tools"
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
		return `[codebase search for '${block.params.query}']`
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
		// [SKYCODE] Без готового векторного индекса (по умолчанию он выключен) ищем по
		// карте символов + ripgrep. Раньше здесь возвращалась ошибка «индекс не готов»,
		// и агент тратил ходы впустую.
		if (!engine || !engine.isReady()) {
			try {
				const result = await searchWithoutIndex(config.cwd, query, maxResults, config.services.skycodeIgnoreController)
				await config.callbacks.removeLastPartialMessageIfExistsWithType("ask", "tool")
				await config.callbacks.say(
					"tool",
					JSON.stringify({ tool: "codebaseSearch", content: `Found relevant code for: ${query}` }),
					undefined,
					undefined,
					false,
				)
				return result
			} catch (error: any) {
				return `Error during codebase search: ${error.message}. Use search_files or glob instead.`
			}
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
