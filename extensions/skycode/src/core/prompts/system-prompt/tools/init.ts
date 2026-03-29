// Import all tool variants
import { SkycodeToolSet } from "../registry/SkycodeToolSet"
import { access_mcp_resource_variants } from "./access_mcp_resource"
import { act_mode_respond_variants } from "./act_mode_respond"
import { apply_patch_variants } from "./apply_patch"
import { ask_followup_question_variants } from "./ask_followup_question"
import { attempt_completion_variants } from "./attempt_completion"
import { browser_action_variants } from "./browser_action"
import { codebase_search_variants } from "./codebase_search"
import { delete_block_variants } from "./delete_block"
import { edit_notebook_variants } from "./edit_notebook"
import { execute_command_variants } from "./execute_command"
import { focus_chain_variants } from "./focus_chain"
import { generate_explanation_variants } from "./generate_explanation"
import { glob_variants } from "./glob"
import { list_code_definition_names_variants } from "./list_code_definition_names"
import { list_files_variants } from "./list_files"
import { load_mcp_documentation_variants } from "./load_mcp_documentation"
import { new_task_variants } from "./new_task"
import { plan_mode_respond_variants } from "./plan_mode_respond"
import { read_file_variants } from "./read_file"
import { read_diagnostics_variants } from "./read_diagnostics"
import { replace_in_file_variants } from "./replace_in_file"
import { replace_text_variants } from "./replace_text"
import { search_files_variants } from "./search_files"
import { use_mcp_tool_variants } from "./use_mcp_tool"
import { use_skill_variants } from "./use_skill"
import { web_fetch_variants } from "./web_fetch"
import { web_search_variants } from "./web_search"
import { write_to_file_variants } from "./write_to_file"

/**
 * Registers all tool variants with the SkycodeToolSet provider.
 * This function must be called at prompt registry
 * to allow all tool sets be available at build time.
 */
export function registerSkycodeToolSets(): void {
	// Collect all variants from all tools
	const allToolVariants = [
		...access_mcp_resource_variants,
		...act_mode_respond_variants,
		...ask_followup_question_variants,
		...attempt_completion_variants,
		...browser_action_variants,
		...codebase_search_variants,
		...delete_block_variants,
		...edit_notebook_variants,
		...execute_command_variants,
		...focus_chain_variants,
		...generate_explanation_variants,
		...glob_variants,
		...list_code_definition_names_variants,
		...list_files_variants,
		...load_mcp_documentation_variants,
		...new_task_variants,
		...plan_mode_respond_variants,
		...read_file_variants,
		...read_diagnostics_variants,
		...replace_in_file_variants,
		...replace_text_variants,
		...search_files_variants,
		...use_mcp_tool_variants,
		...use_skill_variants,
		...web_fetch_variants,
		...web_search_variants,
		...write_to_file_variants,
		...apply_patch_variants,
	]

	// Register each variant
	allToolVariants.forEach((v) => {
		SkycodeToolSet.register(v)
	})
}
