import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"

// [SKYCODE] Общий параметр timeout — одинаково доступен и текстовым, и native-вариантам.
// Явно заданный моделью timeout отменяет 20-секундный auto-proceed в терминале VS Code.
const TIMEOUT_PARAM = {
	name: "timeout",
	required: false,
	type: "integer" as const,
	instruction:
		"Optional timeout in seconds. While the command runs the task is not blocked: after the timeout the command keeps running (in the background for standalone terminals, in the terminal for VSCode) and you get its background id — check it later with check_background_command. Default is 20s for the VSCode terminal and 120s for background execution. Increase for long builds/installs/tests (e.g. 300 for npm install, 600 for heavy builds).",
	usage: "120",
}

// [SKYCODE] Параметра requires_approval здесь больше нет: ExecuteCommandToolHandler его значение
// не читал (решение об аппруве принимают auto-approve настройки), зато модели на нём спотыкались —
// пропущенный параметр стоил целого хода и приближал лимит ошибок.

const GENERIC: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id: SkycodeDefaultTool.BASH,
	name: "execute_command",
	description: `Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Commands will be executed in the current working directory: {{CWD}}{{MULTI_ROOT_HINT}}`,
	parameters: [
		{
			name: "command",
			required: true,
			instruction: `The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.`,
			usage: "Your command here",
		},
		TIMEOUT_PARAM,
	],
}

const NATIVE_GPT_5: SkycodeToolSpec = {
	variant: ModelFamily.NATIVE_GPT_5,
	id: SkycodeDefaultTool.BASH,
	name: SkycodeDefaultTool.BASH,
	description:
		"Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task.",
	parameters: [
		{
			name: "command",
			required: true,
			instruction:
				"The CLI command to execute. This should be valid for the current operating system. Do not use the ~ character or $HOME to refer to the home directory. Always use absolute paths. The command will be executed from the current workspace, you do not need to cd to the workspace.",
		},
		TIMEOUT_PARAM,
	],
}

const NATIVE_NEXT_GEN: SkycodeToolSpec = {
	...NATIVE_GPT_5,
	variant: ModelFamily.NATIVE_NEXT_GEN,
}

const GEMINI_3: SkycodeToolSpec = {
	variant: ModelFamily.GEMINI_3,
	id: SkycodeDefaultTool.BASH,
	name: SkycodeDefaultTool.BASH,
	description:
		"Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. When chaining commands, use the shell operator && (not the HTML entity &amp;&amp;). If using search/grep commands, be careful to not use vague search terms that may return thousands of results. When in PLAN MODE, you may use the execute_command tool, but only in a non-destructive manner and in a way that does not alter any files.",
	parameters: [
		{
			name: "command",
			required: true,
			instruction:
				"The CLI command to execute. This should be valid for the current operating system. For command chaining, use proper shell operators like && to chain commands (e.g., 'cd path && command'). Do not use the ~ character or $HOME to refer to the home directory. Always use absolute paths. Do not run search/grep commands that may return thousands of results.",
		},
		TIMEOUT_PARAM,
	],
}

export const execute_command_variants: SkycodeToolSpec[] = [GENERIC, NATIVE_GPT_5, NATIVE_NEXT_GEN, GEMINI_3]
