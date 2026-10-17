import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"
import { TASK_PROGRESS_PARAMETER } from "../types"

// [SKYCODE] Статичная HTML/SVG-визуализация в чате (скрипты в ней не исполняются)
const id = SkycodeDefaultTool.SHOW_VISUAL

const DESCRIPTION =
	"Show the user a small static visual right in the chat: comparison tables, cards, simple charts drawn as SVG, UI/layout mockups, diagrams that Mermaid cannot express. Scripts do not run and external resources (except https images) are blocked. Do NOT use for plain answers or code (use text/code blocks) or for any diagram, flowchart or architecture/relationship scheme — ALWAYS use a ```mermaid block for those. Do not set text or background colors: the chat theme (light or dark) is applied automatically."

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
