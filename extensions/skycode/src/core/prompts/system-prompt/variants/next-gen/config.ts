import { isGPT5ModelFamily, isLocalModel, isNextGenModelFamily, isNextGenModelProvider } from "@utils/model-utils"
import { ModelFamily } from "@/shared/prompts"
import { Logger } from "@/shared/services/Logger"
import { SkycodeDefaultTool } from "@/shared/tools"
import { SystemPromptSection } from "../../templates/placeholders"
import { createVariant } from "../variant-builder"
import { validateVariant } from "../variant-validator"
import { baseTemplate, rules_template } from "./template"
import { GENERIC_SYSTEM_INFO } from "../generic/template"

// Type-safe variant configuration using the builder pattern
export const config = createVariant(ModelFamily.NEXT_GEN)
	.description("Prompt tailored to newer frontier models with smarter agentic capabilities.")
	.version(1)
	.tags("next-gen", "advanced", "production")
	.labels({
		stable: 1,
		production: 1,
		advanced: 1,
	})
	.matcher((context) => {
		// Match next-gen models
		const providerInfo = context.providerInfo
		if (isNextGenModelFamily(providerInfo.model.id) && !context.enableNativeToolCalls) {
			return true
		}
		const modelId = providerInfo.model.id
		return (
			!(providerInfo.customPrompt === "compact" && isLocalModel(providerInfo)) &&
			!isNextGenModelProvider(providerInfo) &&
			isNextGenModelFamily(modelId) &&
			!(isGPT5ModelFamily(modelId) && !modelId.includes("chat"))
		)
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
		SystemPromptSection.FEEDBACK,
		SystemPromptSection.RULES,
		SystemPromptSection.SYSTEM_INFO,
		SystemPromptSection.OBJECTIVE,
		SystemPromptSection.USER_INSTRUCTIONS,
		SystemPromptSection.SKILLS,
	)
	.tools(
		// Strong model: BASH high priority, full toolset
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
		MODEL_FAMILY: ModelFamily.NEXT_GEN,
	})
	.config({})
	// Override the RULES component with custom template
	.overrideComponent(SystemPromptSection.RULES, {
		template: rules_template,
	})
	.overrideComponent(SystemPromptSection.SYSTEM_INFO, {
		template: GENERIC_SYSTEM_INFO,
	})
	.build()

// Compile-time validation
const validationResult = validateVariant({ ...config, id: ModelFamily.NEXT_GEN }, { strict: true })
if (!validationResult.isValid) {
	Logger.error("Next-gen variant configuration validation failed:", validationResult.errors)
	throw new Error(`Invalid next-gen variant configuration: ${validationResult.errors.join(", ")}`)
}

if (validationResult.warnings.length > 0) {
	Logger.warn("Next-gen variant configuration warnings:", validationResult.warnings)
}

// Export type information for better IDE support
export type NextGenVariantConfig = typeof config
