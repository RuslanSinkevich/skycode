import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"
import { TASK_PROGRESS_PARAMETER } from "../types"

/**
 * ## codebase_search
 * Description: Request to perform a semantic search across the codebase. This tool finds code by meaning and context rather than exact string matches. Use it to understand how features are implemented, find related logic, or explore unfamiliar parts of the codebase.
 * Parameters:
 * - query: (required) The natural language description of what you are looking for.
 * - max_results: (optional) The maximum number of results to return (default is 10).
 * Usage:
 * <codebase_search>
 * <query>How is user authentication implemented?</query>
 * <max_results>15</max_results>
 * </codebase_search>
 */

const id = SkycodeDefaultTool.CODEBASE_SEARCH

const generic: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id,
	name: "codebase_search",
	description:
		"Request to perform a semantic search across the codebase. This tool finds code by meaning and context rather than exact string matches. Use it as the first-choice tool for questions like where logic is implemented, how a feature works, or where related orchestration/flow is located.",
	parameters: [
		{
			name: "query",
			required: true,
			instruction: "The natural language description of what you are looking for.",
			usage: "Search query here",
		},
		{
			name: "max_results",
			required: false,
			instruction: "The maximum number of results to return (default is 10).",
			usage: "10",
		},
		TASK_PROGRESS_PARAMETER,
	],
}

const NATIVE_NEXT_GEN: SkycodeToolSpec = {
	variant: ModelFamily.NATIVE_NEXT_GEN,
	id,
	name: "codebase_search",
	description:
		"Request to perform a semantic search across the codebase. This tool finds code by meaning and context rather than exact string matches and should be preferred first for semantic code discovery.",
	parameters: [
		{
			name: "query",
			required: true,
			instruction: "The natural language description of what you are looking for.",
			usage: "Search query here",
		},
		{
			name: "max_results",
			required: false,
			instruction: "The maximum number of results to return (default is 10).",
			usage: "10",
		},
		TASK_PROGRESS_PARAMETER,
	],
}

const NATIVE_GPT_5: SkycodeToolSpec = {
	...NATIVE_NEXT_GEN,
	variant: ModelFamily.NATIVE_GPT_5,
}

export const codebase_search_variants = [generic, NATIVE_GPT_5, NATIVE_NEXT_GEN]
