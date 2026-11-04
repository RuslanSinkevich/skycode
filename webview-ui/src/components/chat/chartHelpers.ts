// [SKYCODE] Чистые помощники карточки show_chart (say "chart"): разбор нагрузки, шкалы, дуги, копирование.

export type ChartType = "bar" | "line" | "pie" | "table"

export interface XYData {
	labels: string[]
	series: Array<{ name: string; values: number[] }>
	unit?: string
}
export interface PieData {
	labels: string[]
	values: number[]
	unit?: string
}
export interface TableData {
	columns: string[]
	rows: Array<Array<string | number | null>>
}

export type ChartPayload =
	| { title: string; type: "bar" | "line"; data: XYData }
	| { title: string; type: "pie"; data: PieData }
	| { title: string; type: "table"; data: TableData }

const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string")
const isNumArr = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x))

/** Разбирает JSON-нагрузку say("chart"); null при любой ошибке формы */
export function parseChartPayload(text: string | undefined): ChartPayload | null {
	try {
		const p = JSON.parse(text || "{}")
		const d = p?.data
		if (!d || typeof d !== "object") {
			return null
		}
		const title = typeof p.title === "string" ? p.title : ""
		if (p.type === "bar" || p.type === "line") {
			if (!isStrArr(d.labels) || !Array.isArray(d.series)) {
				return null
			}
			const series = d.series
			if (!series.every((s: any) => typeof s?.name === "string" && isNumArr(s.values) && s.values.length === d.labels.length)) {
				return null
			}
			return { title, type: p.type, data: { labels: d.labels, series, unit: typeof d.unit === "string" ? d.unit : undefined } }
		}
		if (p.type === "pie") {
			if (!isStrArr(d.labels) || !isNumArr(d.values) || d.values.length !== d.labels.length) {
				return null
			}
			return { title, type: "pie", data: { labels: d.labels, values: d.values, unit: typeof d.unit === "string" ? d.unit : undefined } }
		}
		if (p.type === "table") {
			if (!isStrArr(d.columns) || !Array.isArray(d.rows) || !d.rows.every((r: unknown) => Array.isArray(r))) {
				return null
			}
			return { title, type: "table", data: { columns: d.columns, rows: d.rows } }
		}
		return null
	} catch {
		return null
	}
}

/** Палитра: цвета диаграмм VS Code с запасными значениями */
export const CHART_PALETTE = [
	"var(--vscode-charts-blue, #3794ff)",
	"var(--vscode-charts-green, #89d185)",
	"var(--vscode-charts-yellow, #cca700)",
	"var(--vscode-charts-orange, #d18616)",
	"var(--vscode-charts-purple, #b180d7)",
	"var(--vscode-charts-red, #f14c4c)",
]

export function paletteColor(i: number): string {
	return CHART_PALETTE[i % CHART_PALETTE.length]
}

/** «Красивая» шкала: 0-включающий диапазон и 4–5 делений с круглым шагом */
export function niceScale(minValue: number, maxValue: number, target = 5): { min: number; max: number; ticks: number[] } {
	let lo = Math.min(0, minValue)
	let hi = Math.max(0, maxValue)
	if (hi === lo) {
		hi = lo + 1
	}
	const rough = (hi - lo) / target
	const pow = 10 ** Math.floor(Math.log10(rough))
	const frac = rough / pow
	const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow
	lo = Math.floor(lo / step) * step
	hi = Math.ceil(hi / step) * step
	const ticks: number[] = []
	const decimals = Math.max(0, -Math.floor(Math.log10(step)))
	for (let v = lo; v <= hi + step / 2; v += step) {
		ticks.push(Number(v.toFixed(decimals)))
	}
	return { min: lo, max: hi, ticks }
}

/** Короткая запись числа для подписей оси */
export function formatTick(n: number): string {
	const a = Math.abs(n)
	if (a >= 1e9) {
		return `${+(n / 1e9).toFixed(1)}B`
	}
	if (a >= 1e6) {
		return `${+(n / 1e6).toFixed(1)}M`
	}
	if (a >= 1e4) {
		return `${+(n / 1e3).toFixed(1)}k`
	}
	return String(+n.toFixed(2))
}

/** Полное значение для подсказки */
export function formatValue(n: number, unit?: string): string {
	const s = Number.isInteger(n) ? n.toLocaleString("en-US") : String(+n.toFixed(2))
	return unit ? `${s} ${unit}` : s
}

export function truncateLabel(label: string, max = 14): string {
	return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

export interface PieSlice {
	index: number
	value: number
	percent: number
	/** SVG path кольцевого сектора; для единственного сектора на 100% — два полукольца */
	path: string
}

/** Секторы кольцевой диаграммы, старт сверху по часовой стрелке */
export function pieSlices(values: number[], cx: number, cy: number, rOuter: number, rInner: number): PieSlice[] {
	const total = values.reduce((a, b) => a + b, 0)
	if (total <= 0) {
		return []
	}
	const pt = (r: number, a: number) => `${+(cx + r * Math.cos(a)).toFixed(2)} ${+(cy + r * Math.sin(a)).toFixed(2)}`
	const slices: PieSlice[] = []
	let start = -Math.PI / 2
	values.forEach((value, index) => {
		if (value <= 0) {
			return
		}
		const frac = value / total
		let sweep = frac * Math.PI * 2
		// Полный круг одной дугой вырождается — чуть не доводим
		if (frac > 0.9999) {
			sweep = Math.PI * 2 - 0.0001
		}
		const end = start + sweep
		const large = sweep > Math.PI ? 1 : 0
		const path = `M ${pt(rOuter, start)} A ${rOuter} ${rOuter} 0 ${large} 1 ${pt(rOuter, end)} L ${pt(rInner, end)} A ${rInner} ${rInner} 0 ${large} 0 ${pt(rInner, start)} Z`
		slices.push({ index, value, percent: frac * 100, path })
		start += frac * Math.PI * 2
	})
	return slices
}

/** Данные карточки как таблица (первая строка — шапка) */
export function chartToRows(payload: ChartPayload): Array<Array<string | number | null>> {
	if (payload.type === "table") {
		return [payload.data.columns, ...payload.data.rows]
	}
	if (payload.type === "pie") {
		const total = payload.data.values.reduce((a, b) => a + b, 0)
		return [
			["", payload.data.unit ?? "", "%"],
			...payload.data.labels.map((l, i) => [l, payload.data.values[i], total ? +((payload.data.values[i] / total) * 100).toFixed(1) : 0]),
		]
	}
	const { labels, series } = payload.data
	return [["", ...series.map((s) => s.name)], ...labels.map((l, i) => [l, ...series.map((s) => s.values[i])])]
}

const cell = (v: string | number | null) => String(v ?? "").replace(/[\t\r\n]+/g, " ")

/** Текст через табуляцию (вставляется в Excel ячейками) */
export function chartToTsv(payload: ChartPayload): string {
	return chartToRows(payload)
		.map((r) => r.map(cell).join("\t"))
		.join("\n")
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Простая HTML-таблица с рамками атрибутами — для Word/Excel/почты */
export function chartToClipboardHtml(payload: ChartPayload): string {
	const rows = chartToRows(payload)
	const td = (tag: "th" | "td", v: string | number | null) =>
		`<${tag} style="border:1px solid #999;padding:4px 8px${typeof v === "number" ? ";text-align:right" : ""}">${esc(String(v ?? ""))}</${tag}>`
	const body = rows.map((r, i) => `<tr>${r.map((v) => td(i === 0 ? "th" : "td", v)).join("")}</tr>`).join("")
	return `<html><body><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">${body}</table></body></html>`
}

/** Столбец таблицы числовой, если все непустые ячейки — числа */
export function isNumericColumn(rows: Array<Array<string | number | null>>, col: number): boolean {
	let seen = false
	for (const r of rows) {
		const v = r[col]
		if (v === null || v === undefined || v === "") {
			continue
		}
		if (typeof v !== "number") {
			return false
		}
		seen = true
	}
	return seen
}
