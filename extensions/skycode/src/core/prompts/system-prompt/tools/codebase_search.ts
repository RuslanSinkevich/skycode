import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"
import { TASK_PROGRESS_PARAMETER } from "../types"

/**
 * ## codebase_search
 * Description: Fast code discovery without any index: matches the query words against the repository map (classes, methods, functions, SQL procedures/tables with file and line) and ranks text matches by how many query words each file contains (comments and strings too, including Russian). Use it first to locate where something lives; write the query as likely identifiers and domain words (e.g. "invoice payment schedule", "договор поиск"), not as a question. Then read_file the exact lines it points to.
 * Parameters:
 * - query: (required) Words to look for: likely identifier parts and domain terms (English or the project's language).
 * - max_results: (optional) The maximum number of results to return (default is 10).
 * Usage:
 * <codebase_search>
 * <query>user login authentication token</query>
 * <max_results>15</max_results>
 * </codebase_search>
 */

const id = SkycodeDefaultTool.CODEBASE_SEARCH

const generic: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id,
	name: "codebase_search",
	description:
		"Fast code discovery without any index: matches the query words against the repository map (classes, methods, functions, SQL procedures/tables with file and line) and ranks text matches by how many query words each file contains (comments and strings too, including Russian). Use it first to locate where something lives; write the query as likely identifiers and domain words (e.g. \"invoice payment schedule\", \"договор поиск\"), not as a question. Then read_file the exact lines it points to.",
	parameters: [
		{
			name: "query",
			required: true,
			instruction: "Words to look for: likely identifier parts and domain terms (English or the project's language).",
			usage: "invoice payment schedule",
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
		"Fast code discovery without any index: matches query words against the repository map (declarations with file and line) and ranks text matches by how many query words each file contains. Use it first to locate code; write the query as likely identifiers and domain words, not as a question, then read_file the lines it points to.",
	parameters: [
		{
			name: "query",
			required: true,
			instruction: "Words to look for: likely identifier parts and domain terms (English or the project's language).",
			usage: "invoice payment schedule",
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
