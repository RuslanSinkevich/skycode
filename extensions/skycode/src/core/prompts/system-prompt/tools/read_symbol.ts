import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"
import { TASK_PROGRESS_PARAMETER } from "../types"

const id = SkycodeDefaultTool.READ_SYMBOL

// [SKYCODE] Чтение одной функции/метода/класса по имени вместо всего файла
const DESCRIPTION =
	"Read one or more functions/methods/classes from a file by name, with line numbers. Prefer this over read_file when you need a specific symbol from a large file. Use list_code_definition_names to see available symbols."

const PARAMETERS: SkycodeToolSpec["parameters"] = [
	{
		name: "path",
		required: true,
		instruction: `The path of the file (relative to the current working directory {{CWD}}){{MULTI_ROOT_HINT}}`,
		usage: "File path here",
	},
	{
		name: "symbol",
		required: true,
		instruction: "Name of the function, method or class, e.g. SaveDocument or ClassName.MethodName. Several names may be given comma-separated (up to 5).",
		usage: "Symbol name here",
	},
	TASK_PROGRESS_PARAMETER,
]

const generic: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id,
	name: "read_symbol",
	description: DESCRIPTION,
	parameters: PARAMETERS,
}

const NATIVE_GPT_5: SkycodeToolSpec = {
	variant: ModelFamily.NATIVE_GPT_5,
	id,
	name: "read_symbol",
	description: DESCRIPTION,
	parameters: PARAMETERS,
}

const NATIVE_NEXT_GEN: SkycodeToolSpec = {
	...NATIVE_GPT_5,
	variant: ModelFamily.NATIVE_NEXT_GEN,
}

export const read_symbol_variants = [generic, NATIVE_NEXT_GEN, NATIVE_GPT_5]
