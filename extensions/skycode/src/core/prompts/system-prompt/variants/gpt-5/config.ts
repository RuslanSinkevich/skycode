import { isGPT5ModelFamily, isNextGenModelProvider } from "@utils/model-utils"
import { ModelFamily } from "@/shared/prompts"
import { Logger } from "@/shared/services/Logger"
import { SkycodeDefaultTool } from "@/shared/tools"
import { SystemPromptSection } from "../../templates/placeholders"
import { createVariant } from "../variant-builder"
import { validateVariant } from "../variant-validator"
import { GPT_5_TEMPLATE_OVERRIDES } from "./template"
import { GENERIC_SYSTEM_INFO } from "../generic/template"

// Type-safe variant configuration using the builder pattern
export const config = createVariant(ModelFamily.GPT_5)
	.description("Prompt tailored to GPT-5 with text-based tools")
	.version(1)
	.tags("gpt", "gpt-5", "advanced", "production")
	.labels({
		stable: 1,
		production: 1,
		advanced: 1,
	})
	// Match GPT-5 models from providers that support native tools
	.matcher((context) => {
		const providerInfo = context.providerInfo
		const modelId = providerInfo.model.id
		return (
			isGPT5ModelFamily(modelId) &&
			!modelId.includes("chat") &&
			isNextGenModelProvider(providerInfo) &&
			!context.enableNativeToolCalls
		)
	})
	.template(GPT_5_TEMPLATE_OVERRIDES.BASE)
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
		MODEL_FAMILY: ModelFamily.GPT_5,
	})
	.config({})
	// Override the RULES component with custom template
	.overrideComponent(SystemPromptSection.RULES, {
		template: GPT_5_TEMPLATE_OVERRIDES.RULES,
	})
	.overrideComponent(SystemPromptSection.SYSTEM_INFO, {
		template: GENERIC_SYSTEM_INFO,
	})
	.build()

// Compile-time validation
const validationResult = validateVariant({ ...config, id: ModelFamily.GPT_5 }, { strict: true })
if (!validationResult.isValid) {
	Logger.error("GPT-5 variant configuration validation failed:", validationResult.errors)
	throw new Error(`Invalid GPT-5 variant configuration: ${validationResult.errors.join(", ")}`)
}

if (validationResult.warnings.length > 0) {
	Logger.warn("GPT-5 variant configuration warnings:", validationResult.warnings)
}

// Export type information for better IDE support
export type GPT5VariantConfig = typeof config
