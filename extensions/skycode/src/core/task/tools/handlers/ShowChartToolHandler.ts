import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { SkycodeDefaultTool } from "@shared/tools"
import type { ToolResponse } from "../../index"
import type { IPartialBlockHandler, IToolHandler } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

// [SKYCODE] Лимиты, чтобы карточка в чате оставалась читаемой
export const MAX_CHART_LABELS = 30
export const MAX_TABLE_COLUMNS = 12

export type ChartType = "bar" | "line" | "pie" | "table"
export type TableCell = string | number | null

export type ChartData =
	| { type: "bar" | "line"; labels: string[]; series: Array<{ name: string; values: number[] }>; unit?: string }
	| { type: "pie"; labels: string[]; values: number[]; unit?: string }
	| { type: "table"; columns: string[]; rows: TableCell[][] }

export type ChartValidation = { ok: true; data: ChartData } | { ok: false; error: string }

const EXAMPLES: Record<ChartType, string> = {
	bar: '{"labels": ["Jan", "Feb"], "series": [{"name": "Errors", "values": [3, 5]}], "unit": "ms"}',
	line: '{"labels": ["Jan", "Feb"], "series": [{"name": "Errors", "values": [3, 5]}], "unit": "ms"}',
	pie: '{"labels": ["A", "B"], "values": [60, 40]}',
	table: '{"columns": ["File", "Lines"], "rows": [["a.cs", 3346], ["b.cs", 120]]}',
}

const CHART_TYPES: ChartType[] = ["bar", "line", "pie", "table"]

function fail(type: ChartType | undefined, problem: string): ChartValidation {
	const shown = type ?? "bar"
	return {
		ok: false,
		error: `show_chart: ${problem}\nExpected "data" for type "${shown}" (valid JSON, double quotes, no comments):\n${EXAMPLES[shown]}\nLimits: at most ${MAX_CHART_LABELS} labels/rows. Fix the data and call show_chart again.`,
	}
}

function toNumber(v: unknown): number | undefined {
	if (typeof v === "number" && Number.isFinite(v)) {
		return v
	}
	if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
		return Number(v)
	}
	return undefined
}

function toNumberArray(arr: unknown[]): number[] | undefined {
	const out: number[] = []
	for (const v of arr) {
		const n = toNumber(v)
		if (n === undefined) {
			return undefined
		}
		out.push(n)
	}
	return out
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** [SKYCODE] Чистая проверка и нормализация данных show_chart. Не бросает исключений. */
export function validateChartData(typeRaw: string | undefined, dataRaw: string | undefined): ChartValidation {
	const type = (typeRaw ?? "").trim().toLowerCase() as ChartType
	if (!CHART_TYPES.includes(type)) {
		return fail(undefined, `unknown type "${typeRaw ?? ""}". Use one of: bar, line, pie, table.`)
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(dataRaw ?? "")
	} catch (e) {
		return fail(type, `"data" is not valid JSON (${e instanceof Error ? e.message : String(e)}).`)
	}
	if (!isRecord(parsed)) {
		return fail(type, '"data" must be a JSON object.')
	}
	const unit = typeof parsed.unit === "string" && parsed.unit.trim() ? parsed.unit.trim() : undefined

	if (type === "table") {
		const { columns, rows } = parsed
		if (!Array.isArray(columns) || columns.length === 0 || columns.length > MAX_TABLE_COLUMNS) {
			return fail(type, `"columns" must be a non-empty array of 1-${MAX_TABLE_COLUMNS} strings.`)
		}
		if (!Array.isArray(rows) || rows.length === 0) {
			return fail(type, '"rows" must be a non-empty array of arrays.')
		}
		if (rows.length > MAX_CHART_LABELS) {
			return fail(type, `too many rows (${rows.length}).`)
		}
		const outRows: TableCell[][] = []
		for (const [i, row] of rows.entries()) {
			if (!Array.isArray(row) || row.length !== columns.length) {
				return fail(type, `row ${i} must be an array with exactly ${columns.length} cells (one per column).`)
			}
			outRows.push(
				row.map((c) => {
					if (c === null || c === undefined) {
						return null
					}
					return typeof c === "number" || typeof c === "string" ? c : String(c)
				}),
			)
		}
		return { ok: true, data: { type, columns: columns.map(String), rows: outRows } }
	}

	const { labels } = parsed
	if (!Array.isArray(labels) || labels.length === 0) {
		return fail(type, '"labels" must be a non-empty array of strings.')
	}
	if (labels.length > MAX_CHART_LABELS) {
		return fail(type, `too many labels (${labels.length}).`)
	}
	const outLabels = labels.map(String)

	if (type === "pie") {
		if (!Array.isArray(parsed.values)) {
			return fail(type, '"values" must be an array of numbers.')
		}
		const values = toNumberArray(parsed.values)
		if (!values) {
			return fail(type, '"values" must contain only numbers.')
		}
		if (values.length !== outLabels.length) {
			return fail(type, `"values" has ${values.length} items but "labels" has ${outLabels.length}; they must match.`)
		}
		if (values.some((v) => v < 0) || values.every((v) => v === 0)) {
			return fail(type, '"values" must be non-negative and not all zero.')
		}
		return { ok: true, data: { type, labels: outLabels, values, unit } }
	}

	// bar / line
	const { series } = parsed
	if (!Array.isArray(series) || series.length === 0 || series.length > 8) {
		return fail(type, '"series" must be a non-empty array (max 8) of {"name", "values"} objects.')
	}
	const outSeries: Array<{ name: string; values: number[] }> = []
	for (const [i, s] of series.entries()) {
		if (!isRecord(s) || !Array.isArray(s.values)) {
			return fail(type, `series ${i} must be an object like {"name": "...", "values": [1, 2]}.`)
		}
		const values = toNumberArray(s.values)
		if (!values) {
			return fail(type, `series ${i} "values" must contain only numbers.`)
		}
		if (values.length !== outLabels.length) {
			return fail(type, `series ${i} has ${values.length} values but "labels" has ${outLabels.length}; they must match.`)
		}
		outSeries.push({ name: typeof s.name === "string" && s.name ? s.name : `Series ${i + 1}`, values })
	}
	return { ok: true, data: { type, labels: outLabels, series: outSeries, unit } }
}

/** [SKYCODE] Полезная нагрузка say("chart"): JSON { title, type, data } в text */
export function buildChartPayload(title: string, validated: ChartData): string {
	const { type, ...data } = validated
	return JSON.stringify({ title: title.trim(), type, data })
}

/**
 * [SKYCODE] show_chart: структурированные данные (столбцы, линии, круговая, таблица) —
 * модель даёт JSON, рисует карточка в вебвью. Одобрение не нужно.
 */
export class ShowChartToolHandler implements IToolHandler, IPartialBlockHandler {
	readonly name = SkycodeDefaultTool.SHOW_CHART

	getDescription(block: ToolUse): string {
		return `[${block.name} for '${block.params.title}']`
	}

	async handlePartialBlock(_block: ToolUse, _uiHelpers: StronglyTypedUIHelpers): Promise<void> {}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const title: string | undefined = block.params.title
		const type: string | undefined = block.params.type
		const data: string | undefined = block.params.data

		if (!title) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "title")
		}
		if (!type) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "type")
		}
		if (!data) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "data")
		}

		const result = validateChartData(type, data)
		if (!result.ok) {
			config.taskState.consecutiveMistakeCount++
			return formatResponse.toolError(result.error)
		}
		config.taskState.consecutiveMistakeCount = 0

		await config.callbacks.say("chart", buildChartPayload(title, result.data), undefined, undefined, false)

		return formatResponse.toolResult(`Chart "${title.trim()}" shown to the user.`)
	}
}
