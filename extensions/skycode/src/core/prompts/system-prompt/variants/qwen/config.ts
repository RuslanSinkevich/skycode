import { ModelFamily } from "@/shared/prompts"
import { Logger } from "@/shared/services/Logger"
import { SkycodeDefaultTool } from "@/shared/tools"
import { isQwenModelFamily } from "@/utils/model-utils"
import { SystemPromptSection } from "../../templates/placeholders"
import { createVariant } from "../variant-builder"
import { validateVariant } from "../variant-validator"
import { qwenComponentOverrides } from "./overrides"
import { baseTemplate } from "./template"
import { GENERIC_SYSTEM_INFO } from "../generic/template"

export const config = createVariant(ModelFamily.QWEN)
	.description("Prompt optimized for Qwen models with clear, compact instructions.")
	.version(1)
	.tags("qwen", "stable")
	.labels({
		stable: 1,
		production: 1,
	})
	.matcher((context) => {
		return isQwenModelFamily(context.providerInfo.model.id)
	})
	.template(baseTemplate)
	.components(
		SystemPromptSection.AGENT_ROLE,
		SystemPromptSection.TOOL_USE,
		SystemPromptSection.RULES,
		SystemPromptSection.ACT_VS_PLAN,
		SystemPromptSection.CLI_SUBAGENTS,
		SystemPromptSection.CAPABILITIES,
		SystemPromptSection.EDITING_FILES,
		SystemPromptSection.TODO,
		SystemPromptSection.MCP,
		SystemPromptSection.TASK_PROGRESS,
		SystemPromptSection.SYSTEM_INFO,
		SystemPromptSection.OBJECTIVE,
		SystemPromptSection.USER_INSTRUCTIONS,
		SystemPromptSection.SKILLS,
	)
	.tools(
		SkycodeDefaultTool.FILE_READ,
		SkycodeDefaultTool.FILE_NEW,
		SkycodeDefaultTool.FILE_EDIT,
		SkycodeDefaultTool.CODEBASE_SEARCH,
		SkycodeDefaultTool.SEARCH,
		SkycodeDefaultTool.LIST_FILES,
		SkycodeDefaultTool.GLOB,
		SkycodeDefaultTool.LIST_CODE_DEF,
		SkycodeDefaultTool.READ_DIAGNOSTICS,
		SkycodeDefaultTool.WEB_SEARCH,
		SkycodeDefaultTool.MCP_USE,
		SkycodeDefaultTool.MCP_ACCESS,
		SkycodeDefaultTool.MCP_DOCS,
		SkycodeDefaultTool.BROWSER,
		SkycodeDefaultTool.BASH,
		SkycodeDefaultTool.TODO,
		SkycodeDefaultTool.GENERATE_EXPLANATION,
		SkycodeDefaultTool.USE_SKILL,
		SkycodeDefaultTool.ATTEMPT,
		SkycodeDefaultTool.PLAN_MODE,
		SkycodeDefaultTool.ASK,
	)
	.placeholders({
		MODEL_FAMILY: "qwen",
	})
	.config({})
	.overrideComponent(SystemPromptSection.AGENT_ROLE, qwenComponentOverrides[SystemPromptSection.AGENT_ROLE])
	.overrideComponent(SystemPromptSection.TOOL_USE, qwenComponentOverrides[SystemPromptSection.TOOL_USE])
	.overrideComponent(SystemPromptSection.OBJECTIVE, qwenComponentOverrides[SystemPromptSection.OBJECTIVE])
	.overrideComponent(SystemPromptSection.RULES, qwenComponentOverrides[SystemPromptSection.RULES])
	.overrideComponent(SystemPromptSection.TASK_PROGRESS, qwenComponentOverrides[SystemPromptSection.TASK_PROGRESS])
	.overrideComponent(SystemPromptSection.MCP, qwenComponentOverrides[SystemPromptSection.MCP])
	.overrideComponent(SystemPromptSection.EDITING_FILES, qwenComponentOverrides[SystemPromptSection.EDITING_FILES])
	.overrideComponent(SystemPromptSection.SYSTEM_INFO, {
		template: GENERIC_SYSTEM_INFO,
	})
	.build()

const validationResult = validateVariant({ ...config, id: "qwen" }, { strict: true })
if (!validationResult.isValid) {
	Logger.error("Qwen variant configuration validation failed:", validationResult.errors)
	throw new Error(`Invalid Qwen variant configuration: ${validationResult.errors.join(", ")}`)
}

if (validationResult.warnings.length > 0) {
	Logger.warn("Qwen variant configuration warnings:", validationResult.warnings)
}

export type QwenVariantConfig = typeof config
