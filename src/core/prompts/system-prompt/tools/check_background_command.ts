import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"

const GENERIC: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id: SkycodeDefaultTool.CHECK_BACKGROUND,
	name: "check_background_command",
	description: `Check the status and output of a background command. Use this to check on commands that were moved to the background after a timeout. If no id is provided, lists all tracked background commands. If an id is provided, returns the status, elapsed time, and last 50 lines of output for that specific command.`,
	parameters: [
		{
			name: "id",
			required: false,
			instruction:
				"The background command ID to check (e.g. 'background-1712345678-abc123def'). If omitted, returns a list of all tracked background commands with their status.",
			usage: "background-1712345678-abc123def",
		},
	],
}

const NATIVE_GPT_5: SkycodeToolSpec = {
	variant: ModelFamily.NATIVE_GPT_5,
	id: SkycodeDefaultTool.CHECK_BACKGROUND,
	name: SkycodeDefaultTool.CHECK_BACKGROUND,
	description:
		"Check the status and output of a background command. If no id is provided, lists all tracked background commands. If an id is provided, returns status, elapsed time, and last 50 lines of output.",
	parameters: [
		{
			name: "id",
			required: false,
			instruction:
				"The background command ID to check. If omitted, returns a list of all tracked background commands.",
		},
	],
}

const NATIVE_NEXT_GEN: SkycodeToolSpec = {
	...NATIVE_GPT_5,
	variant: ModelFamily.NATIVE_NEXT_GEN,
}

const GEMINI_3: SkycodeToolSpec = {
	variant: ModelFamily.GEMINI_3,
	id: SkycodeDefaultTool.CHECK_BACKGROUND,
	name: SkycodeDefaultTool.CHECK_BACKGROUND,
	description:
		"Check the status and output of a background command. If no id is provided, lists all tracked background commands. If an id is provided, returns status, elapsed time, and last 50 lines of output.",
	parameters: [
		{
			name: "id",
			required: false,
			instruction:
				"The background command ID to check. If omitted, returns a list of all tracked background commands.",
		},
	],
}

export const check_background_command_variants: SkycodeToolSpec[] = [GENERIC, NATIVE_GPT_5, NATIVE_NEXT_GEN, GEMINI_3]
