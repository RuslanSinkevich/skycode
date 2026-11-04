import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"
import { TASK_PROGRESS_PARAMETER } from "../types"

// [SKYCODE] Структурированный график/таблица: модель даёт JSON, отрисовка — в интерфейсе
const id = SkycodeDefaultTool.SHOW_CHART

const DESCRIPTION =
	"Show the user a chart or table built from structured data (bar, line, pie, table). Use it for numbers, comparisons and tables; prefer it over show_visual for any chart or table. The data must be valid JSON. Keep it to at most 30 labels/rows."

const DATA_INSTRUCTION =
	'JSON string. bar/line: {"labels": ["Jan","Feb"], "series": [{"name": "Errors", "values": [3, 5]}], "unit": "ms"}. pie: {"labels": ["A","B"], "values": [60, 40]}. table: {"columns": ["File","Lines"], "rows": [["a.cs", 3346]]}.'

const generic: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id,
	name: "show_chart",
	description: DESCRIPTION,
	parameters: [
		{
			name: "title",
			required: true,
			instruction: "Short title of the chart or table.",
			usage: "Title here",
		},
		{
			name: "type",
			required: true,
			instruction: "One of: bar, line, pie, table.",
			usage: "bar",
		},
		{
			name: "data",
			required: true,
			instruction: DATA_INSTRUCTION,
			usage: '{"labels": ["Jan", "Feb"], "series": [{"name": "Errors", "values": [3, 5]}]}',
		},
		TASK_PROGRESS_PARAMETER,
	],
}

const NATIVE_NEXT_GEN: SkycodeToolSpec = {
	variant: ModelFamily.NATIVE_NEXT_GEN,
	id,
	name: "show_chart",
	description: DESCRIPTION,
	parameters: [
		{
			name: "title",
			required: true,
			instruction: "Short title of the chart or table.",
		},
		{
			name: "type",
			required: true,
			instruction: "One of: bar, line, pie, table.",
		},
		{
			name: "data",
			required: true,
			instruction: DATA_INSTRUCTION,
		},
		TASK_PROGRESS_PARAMETER,
	],
}

const NATIVE_GPT_5: SkycodeToolSpec = {
	...NATIVE_NEXT_GEN,
	variant: ModelFamily.NATIVE_GPT_5,
}

export const show_chart_variants = [generic, NATIVE_GPT_5, NATIVE_NEXT_GEN]
