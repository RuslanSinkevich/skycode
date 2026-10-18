import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"
import { TASK_PROGRESS_PARAMETER } from "../types"

// [SKYCODE] Статичная HTML/SVG-визуализация в чате (скрипты в ней не исполняются)
const id = SkycodeDefaultTool.SHOW_VISUAL

const DESCRIPTION =
	"NOT for diagrams: any diagram, flowchart, scheme of relationships or architecture must be a ```mermaid code block in your response text, never this tool. Use show_visual only for a small static visual that is not a diagram: a UI/layout mockup or a styled card. For numbers and tables use show_chart. Scripts do not run; external resources except https images are blocked. Do not set text or background colors: the chat theme is applied automatically."

const generic: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id,
	name: "show_visual",
	description: DESCRIPTION,
	parameters: [
		{
			name: "title",
			required: true,
			instruction: "Short title of the visual.",
			usage: "Title here",
		},
		{
			name: "content",
			required: true,
			instruction: "A self-contained HTML fragment or an <svg>. Inline CSS only; no scripts.",
			usage: "<table>...</table> or <svg>...</svg>",
		},
		TASK_PROGRESS_PARAMETER,
	],
}

const NATIVE_NEXT_GEN: SkycodeToolSpec = {
	variant: ModelFamily.NATIVE_NEXT_GEN,
	id,
	name: "show_visual",
	description: DESCRIPTION,
	parameters: [
		{
			name: "title",
			required: true,
			instruction: "Short title of the visual.",
		},
		{
			name: "content",
			required: true,
			instruction: "A self-contained HTML fragment or an <svg>. Inline CSS only; no scripts.",
		},
		TASK_PROGRESS_PARAMETER,
	],
}

const NATIVE_GPT_5: SkycodeToolSpec = {
	...NATIVE_NEXT_GEN,
	variant: ModelFamily.NATIVE_GPT_5,
}

export const show_visual_variants = [generic, NATIVE_GPT_5, NATIVE_NEXT_GEN]
