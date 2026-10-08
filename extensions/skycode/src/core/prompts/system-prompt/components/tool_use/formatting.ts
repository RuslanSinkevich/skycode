import { TemplateEngine } from "../../templates/TemplateEngine"
import type { PromptVariant, SystemPromptContext } from "../../types"

export async function getToolUseFormattingSection(_variant: PromptVariant, context: SystemPromptContext): Promise<string> {
	// Return the placeholder that will be replaced with actual tools
	const template = TOOL_USE_FORMATTING_TEMPLATE_TEXT

	const focusChainEnabled = context.focusChainSettings?.enabled

	const templateEngine = new TemplateEngine()
	return templateEngine.resolve(template, context, {
		FOCUS_CHATIN_FORMATTING: focusChainEnabled ? FOCUS_CHATIN_FORMATTING_TEMPLATE : "",
	})
}

const FOCUS_CHATIN_FORMATTING_TEMPLATE = `<task_progress>
Checklist here (optional)
</task_progress>
`

const TOOL_USE_FORMATTING_TEMPLATE_TEXT = `# Tool Use Formatting

Tool use is formatted using XML-style tags. The tool name is the opening and closing tag of the whole call, and every parameter is a tag named after that parameter itself.

For example, calling the read_file tool with a path parameter:

<read_file>
<path>src/main.js</path>
{{FOCUS_CHATIN_FORMATTING}}</read_file>

Substitute the real tool name and the real parameter names into the tags, exactly as they are spelled in the tool description below.

Always adhere to this format for the tool use to ensure proper parsing and execution.`
