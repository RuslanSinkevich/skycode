import { ModelFamily } from "@/shared/prompts"
import { Logger } from "@/shared/services/Logger"
import { SkycodeDefaultTool } from "@/shared/tools"
import { isDevstralModelFamily } from "@/utils/model-utils"
import { SystemPromptSection } from "../../templates/placeholders"
import { createVariant } from "../variant-builder"
import { validateVariant } from "../variant-validator"
import { DEVSTRAL_AGENT_ROLE_TEMPLATE } from "./overrides"
import { baseTemplate } from "./template"
import { GENERIC_SYSTEM_INFO } from "../generic/template"

export const config = createVariant(ModelFamily.DEVSTRAL)
	.description("Baseline prompt for Devstral family models")
	.version(1)
	.tags("devstral", "stable")
	.labels({
		stable: 1,
		production: 1,
	})
	.matcher((context) => {
		return isDevstralModelFamily(context.providerInfo.model.id)
	})
	.template(baseTemplate)
	.components(
		SystemPromptSection.AGENT_ROLE,
		SystemPromptSection.TOOL_USE,
		SystemPromptSection.TASK_PROGRESS,
		SystemPromptSection.MCP,
		SystemPromptSection.EDITING_FILES,
		SystemPromptSection.ACT_VS_PLAN,
		SystemPromptSection.CLI_SUBAGENTS,
		SystemPromptSection.CAPABILITIES,
		SystemPromptSection.RULES,
		SystemPromptSection.SYSTEM_INFO,
		SystemPromptSection.OBJECTIVE,
		SystemPromptSection.USER_INSTRUCTIONS,
		SystemPromptSection.SKILLS,
	)
	.tools(
		SkycodeDefaultTool.BASH,
		SkycodeDefaultTool.FILE_READ,
		SkycodeDefaultTool.FILE_NEW,
		SkycodeDefaultTool.FILE_EDIT,
		SkycodeDefaultTool.EDIT_NOTEBOOK,
		SkycodeDefaultTool.CODEBASE_SEARCH,
		SkycodeDefaultTool.SEARCH,
		SkycodeDefaultTool.LIST_FILES,
		SkycodeDefaultTool.GLOB,
		SkycodeDefaultTool.LIST_CODE_DEF,
		SkycodeDefaultTool.READ_DIAGNOSTICS,
		SkycodeDefaultTool.BROWSER,
		SkycodeDefaultTool.WEB_FETCH,
		SkycodeDefaultTool.WEB_SEARCH,
		SkycodeDefaultTool.MCP_USE,
		SkycodeDefaultTool.MCP_ACCESS,
		SkycodeDefaultTool.MCP_DOCS,
		SkycodeDefaultTool.TODO,
		SkycodeDefaultTool.GENERATE_EXPLANATION,
		SkycodeDefaultTool.USE_SKILL,
		SkycodeDefaultTool.ATTEMPT,
		SkycodeDefaultTool.PLAN_MODE,
		SkycodeDefaultTool.ASK,
	)
	.placeholders({
		MODEL_FAMILY: "devstral",
	})
	.config({})
	.overrideComponent(SystemPromptSection.AGENT_ROLE, {
		template: DEVSTRAL_AGENT_ROLE_TEMPLATE,
	})
	.overrideComponent(SystemPromptSection.SYSTEM_INFO, {
		template: GENERIC_SYSTEM_INFO,
	})
	.build()

// Compile-time validation
const validationResult = validateVariant({ ...config, id: "devstral" }, { strict: true })
if (!validationResult.isValid) {
	Logger.error("Devstral variant configuration validation failed:", validationResult.errors)
	throw new Error(`Invalid Devstral variant configuration: ${validationResult.errors.join(", ")}`)
}

if (validationResult.warnings.length > 0) {
	Logger.warn("Devstral variant configuration warnings:", validationResult.warnings)
}

// Export type information for better IDE support
export type DevstralVariantConfig = typeof config
