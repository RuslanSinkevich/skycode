import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { render as rtlRender } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { I18nProvider } from "@/i18n"
import { ChartCard } from "./ChartCard"
import { chartToTsv, niceScale, parseChartPayload, pieSlices, truncateLabel } from "./chartHelpers"

const msg = (title: string, type: string, data: unknown): SkycodeMessage => ({
	ts: 1,
	type: "say",
	say: "chart",
	text: JSON.stringify({ title, type, data }),
})

const body = (c: HTMLElement) => c.querySelector("[data-testid=\"chart-body\"]") as HTMLElement

const renderCard = (m: SkycodeMessage) =>
	rtlRender(
		<I18nProvider>
			<ChartCard message={m} />
		</I18nProvider>,
	)

describe("chartHelpers", () => {
	it("niceScale gives round ticks including zero", () => {
		const s = niceScale(3, 97)
		expect(s.ticks).toEqual([0, 20, 40, 60, 80, 100])
		expect(niceScale(0, 0).ticks.length).toBeGreaterThan(1)
		expect(niceScale(-5, 10).min).toBeLessThan(0)
	})

	it("pieSlices share sums to 100", () => {
		const slices = pieSlices([1, 1, 2], 80, 80, 78, 46)
		expect(slices.map((s) => s.percent)).toEqual([25, 25, 50])
		expect(pieSlices([5], 80, 80, 78, 46)).toHaveLength(1)
		expect(pieSlices([0, 0], 80, 80, 78, 46)).toEqual([])
	})

	it("truncateLabel and parse validation", () => {
		expect(truncateLabel("abcdefghijklmnopq", 5)).toBe("abcd…")
		expect(parseChartPayload("nope")).toBeNull()
		expect(parseChartPayload(JSON.stringify({ title: "t", type: "bar", data: { labels: ["a"], series: [{ name: "s", values: [1, 2] }] } }))).toBeNull()
	})

	it("chartToTsv for series and table", () => {
		const bar = parseChartPayload(
			JSON.stringify({ title: "t", type: "bar", data: { labels: ["a", "b"], series: [{ name: "S", values: [1, 2] }] } }),
		)!
		expect(chartToTsv(bar)).toBe("\tS\na\t1\nb\t2")
		const table = parseChartPayload(JSON.stringify({ title: "t", type: "table", data: { columns: ["A", "B"], rows: [["x", 1]] } }))!
		expect(chartToTsv(table)).toBe("A\tB\nx\t1")
	})
})

describe("ChartCard", () => {
	it("renders bars with a legend for multiple series", () => {
		localStorage.setItem("skycode.interfaceLanguage", "en")
		const { container, getByText } = renderCard(
			msg("Errors", "bar", { labels: ["Jan", "Feb"], series: [{ name: "S1", values: [3, 5] }, { name: "S2", values: [1, 2] }] }),
		)
		expect(getByText("Errors")).toBeInTheDocument()
		expect(body(container).querySelectorAll("rect")).toHaveLength(4)
		expect(getByText("S2")).toBeInTheDocument()
	})

	it("renders a line chart", () => {
		const { container } = renderCard(msg("L", "line", { labels: ["a", "b", "c"], series: [{ name: "S", values: [1, 3, 2] }] }))
		expect(body(container).querySelectorAll("polyline")).toHaveLength(1)
		expect(body(container).querySelectorAll("circle")).toHaveLength(3)
	})

	it("renders a donut with percentages", () => {
		const { container, getByText } = renderCard(msg("P", "pie", { labels: ["A", "B"], values: [1, 3] }))
		expect(body(container).querySelectorAll("path")).toHaveLength(2)
		expect(getByText("75.0%")).toBeInTheDocument()
	})

	it("renders a table with right-aligned numbers and escapes text", () => {
		const { container } = renderCard(msg("T", "table", { columns: ["File", "Lines"], rows: [["<b>x</b>", 3346]] }))
		const tds = body(container).querySelectorAll("td")
		expect(tds[0].textContent).toBe("<b>x</b>")
		expect(container.querySelector("b")).toBeNull()
		expect((tds[1] as HTMLElement).style.textAlign).toBe("right")
	})
})
