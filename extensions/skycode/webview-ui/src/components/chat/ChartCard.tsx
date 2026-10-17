import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { StringRequest } from "@shared/proto/skycode/common"
import { CheckIcon, CopyIcon, Maximize2Icon } from "lucide-react"
import { memo, useMemo, useRef, useState } from "react"
import { useI18n } from "@/i18n"
import { FileServiceClient } from "@/services/grpc-client"
import {
	type ChartPayload,
	chartToClipboardHtml,
	chartToTsv,
	formatTick,
	formatValue,
	isNumericColumn,
	niceScale,
	type PieData,
	paletteColor,
	parseChartPayload,
	pieSlices,
	type TableData,
	truncateLabel,
	type XYData,
} from "./chartHelpers"
import { buildVisualDocument } from "./visualSrcDoc"

// [SKYCODE] Карточка show_chart (say "chart"): SVG строится в React из чисел и строк (экранирование — само),
// поэтому ничего от модели не попадает в innerHTML. Стили — инлайном, чтобы outerHTML жил в отдельной вкладке.

const W = 420
const H = 240
const FG = "var(--vscode-foreground, #ccc)"
const GRID = "var(--vscode-panel-border, #555)"
const TEXT_STYLE = { fill: FG, fontSize: 11, fontFamily: "var(--vscode-font-family, sans-serif)" } as const

const iconButtonClass =
	"flex items-center justify-center size-5 rounded-sm bg-transparent border-0 cursor-pointer text-inherit opacity-70 hover:opacity-100 hover:bg-(--vscode-toolbar-hoverBackground)"

function Legend({ items }: { items: Array<{ color: string; text: string }> }) {
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12, padding: "4px 0" }}>
			{items.map((it, i) => (
				<span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
					<span style={{ width: 10, height: 10, borderRadius: 2, background: it.color, display: "inline-block" }} />
					{it.text}
				</span>
			))}
		</div>
	)
}

function XYChart({ type, data }: { type: "bar" | "line"; data: XYData }) {
	const { labels, series, unit } = data
	const n = labels.length
	const all = series.flatMap((s) => s.values)
	const scale = niceScale(Math.min(...all), Math.max(...all))
	const tickLabels = scale.ticks.map(formatTick)
	const left = 12 + Math.max(...tickLabels.map((t) => t.length)) * 6
	const right = 10
	const top = 10
	const plotW = W - left - right
	const slot = plotW / n
	// Длинные или частые подписи наклоняем и режем
	const rotate = n > 7 || Math.max(...labels.map((l) => l.length)) * 6 > slot
	const bottom = rotate ? 58 : 26
	const plotH = H - top - bottom
	const y = (v: number) => top + plotH * (1 - (v - scale.min) / (scale.max - scale.min))
	const barW = Math.min(36, (slot * 0.76) / series.length)
	const xCenter = (i: number) => left + slot * (i + 0.5)

	return (
		<>
			<svg role="img" style={{ width: "100%", maxWidth: 760, height: "auto", display: "block" }} viewBox={`0 0 ${W} ${H}`}>
				{scale.ticks.map((t, i) => (
					<g key={t}>
						<line stroke={GRID} strokeWidth={t === 0 ? 1.5 : 0.5} x1={left} x2={W - right} y1={y(t)} y2={y(t)} />
						<text style={TEXT_STYLE} textAnchor="end" x={left - 4} y={y(t) + 4}>
							{tickLabels[i]}
						</text>
					</g>
				))}
				{labels.map((l, i) => {
					const x = xCenter(i)
					const ty = H - bottom + 14
					return (
						<text
							key={i}
							style={TEXT_STYLE}
							textAnchor={rotate ? "end" : "middle"}
							transform={rotate ? `rotate(-35 ${x} ${ty - 4})` : undefined}
							x={x}
							y={ty}>
							<title>{l}</title>
							{truncateLabel(l, rotate ? 14 : Math.max(4, Math.floor(slot / 6)))}
						</text>
					)
				})}
				{type === "bar" &&
					series.map((s, si) =>
						s.values.map((v, i) => {
							const x = xCenter(i) - (barW * series.length) / 2 + si * barW
							const y0 = y(Math.max(v, 0))
							const h = Math.abs(y(v) - y(0))
							return (
								<rect height={Math.max(h, 1)} key={`${si}-${i}`} rx={1.5} style={{ fill: paletteColor(si) }} width={barW - 1} x={x} y={y0}>
									<title>{`${s.name}, ${labels[i]}: ${formatValue(v, unit)}`}</title>
								</rect>
							)
						}),
					)}
				{type === "line" &&
					series.map((s, si) => (
						<g key={si}>
							<polyline
								fill="none"
								points={s.values.map((v, i) => `${xCenter(i)},${y(v)}`).join(" ")}
								strokeLinejoin="round"
								strokeWidth={2}
								style={{ stroke: paletteColor(si) }}
							/>
							{s.values.map((v, i) => (
								<circle cx={xCenter(i)} cy={y(v)} key={i} r={3} style={{ fill: paletteColor(si) }}>
									<title>{`${s.name}, ${labels[i]}: ${formatValue(v, unit)}`}</title>
								</circle>
							))}
						</g>
					))}
			</svg>
			{series.length > 1 && <Legend items={series.map((s, i) => ({ color: paletteColor(i), text: s.name }))} />}
		</>
	)
}

function PieChart({ data }: { data: PieData }) {
	const slices = pieSlices(data.values, 80, 80, 78, 46)
	const total = data.values.reduce((a, b) => a + b, 0)
	const bySlice = new Map(slices.map((s) => [s.index, s]))
	return (
		<div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "4px 0" }}>
			<svg role="img" style={{ width: 160, height: 160, flex: "none" }} viewBox="0 0 160 160">
				{slices.map((s) => (
					<path d={s.path} key={s.index} style={{ fill: paletteColor(s.index), stroke: "var(--vscode-editor-background, #1e1e1e)", strokeWidth: 1 }}>
						<title>{`${data.labels[s.index]}: ${formatValue(s.value, data.unit)} (${s.percent.toFixed(1)}%)`}</title>
					</path>
				))}
			</svg>
			<div style={{ display: "grid", gridTemplateColumns: "auto auto auto auto", gap: "3px 10px", fontSize: 12, alignItems: "center" }}>
				{data.labels.map((l, i) => (
					<div key={i} style={{ display: "contents" }}>
						<span style={{ width: 10, height: 10, borderRadius: 2, background: paletteColor(i), display: "inline-block" }} />
						<span>{l}</span>
						<span style={{ textAlign: "right" }}>{formatValue(data.values[i], data.unit)}</span>
						<span style={{ textAlign: "right", opacity: 0.7 }}>{`${bySlice.get(i)?.percent.toFixed(1) ?? "0.0"}%`}</span>
					</div>
				))}
				<span />
				<span style={{ fontWeight: 600 }}>Σ</span>
				<span style={{ textAlign: "right", fontWeight: 600 }}>{formatValue(total, data.unit)}</span>
				<span />
			</div>
		</div>
	)
}

function TableChart({ data }: { data: TableData }) {
	const cellStyle = { border: "1px solid var(--vscode-panel-border, #555)", padding: "4px 8px" } as const
	return (
		<table style={{ borderCollapse: "collapse", fontSize: 12 }}>
			<thead>
				<tr>
					{data.columns.map((c, i) => (
						<th key={i} style={{ ...cellStyle, fontWeight: 600, textAlign: isNumericColumn(data.rows, i) ? "right" : "left" }}>
							{c}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{data.rows.map((r, ri) => (
					<tr key={ri}>
						{data.columns.map((_, ci) => (
							<td key={ci} style={{ ...cellStyle, textAlign: isNumericColumn(data.rows, ci) ? "right" : "left" }}>
								{r[ci] ?? ""}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	)
}

export function ChartBody({ payload }: { payload: ChartPayload }) {
	switch (payload.type) {
		case "table":
			return <TableChart data={payload.data} />
		case "pie":
			return <PieChart data={payload.data} />
		default:
			return <XYChart data={payload.data} type={payload.type} />
	}
}

export const ChartCard = memo(({ message }: { message: SkycodeMessage }) => {
	const { t } = useI18n()
	const [copied, setCopied] = useState(false)
	const bodyRef = useRef<HTMLDivElement>(null)
	const payload = useMemo(() => parseChartPayload(message.text), [message.text])

	if (!payload) {
		return null
	}
	const title = payload.title || t("chat.chart.title")

	const copy = async () => {
		const plain = chartToTsv(payload)
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([chartToClipboardHtml(payload)], { type: "text/html" }),
					"text/plain": new Blob([plain], { type: "text/plain" }),
				}),
			])
		} catch {
			await navigator.clipboard.writeText(plain)
		}
		setCopied(true)
		setTimeout(() => setCopied(false), 1500)
	}
	const openInEditor = () => {
		const body = bodyRef.current?.innerHTML ?? ""
		FileServiceClient.openVisual(StringRequest.create({ value: JSON.stringify({ title, html: buildVisualDocument(body, title) }) })).catch(
			(err) => console.error("[ChartCard] openVisual failed:", err),
		)
	}

	return (
		<div className="rounded-sm border border-(--vscode-panel-border) overflow-hidden my-1 w-full">
			<div className="flex items-center justify-between gap-2 px-2 py-1 text-xs bg-(--vscode-sideBar-background) border-b border-(--vscode-panel-border)">
				<span className="font-medium truncate">{title}</span>
				<div className="flex items-center gap-1 shrink-0">
					<button aria-label={t("chat.chart.copy")} className={iconButtonClass} onClick={copy} title={t("chat.chart.copy")} type="button">
						{copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
					</button>
					<button
						aria-label={t("chat.chart.expand")}
						className={iconButtonClass}
						onClick={openInEditor}
						title={t("chat.chart.expand")}
						type="button">
						<Maximize2Icon size={12} />
					</button>
				</div>
			</div>
			<div className="overflow-auto p-2" data-testid="chart-body" ref={bodyRef} style={{ maxHeight: 520 }}>
				<ChartBody payload={payload} />
			</div>
		</div>
	)
})

ChartCard.displayName = "ChartCard"
