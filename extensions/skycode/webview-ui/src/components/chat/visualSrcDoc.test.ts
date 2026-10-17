import { describe, expect, it } from "vitest"
import { buildVisualSrcDoc, parseVisualPayload } from "./visualSrcDoc"

describe("buildVisualSrcDoc", () => {
	it("strips script tags and on* attributes", () => {
		const html = buildVisualSrcDoc(
			'<p onclick="alert(1)">hi</p><script>alert(2)</script><svg onload="x()"><circle r="5"/></svg><img src="https://a/b.png" onerror=\'x()\'>',
		)
		expect(html).not.toMatch(/<script/i)
		expect(html).not.toMatch(/onclick|onload|onerror/i)
		expect(html).toContain("<p>hi</p>")
		expect(html).toContain("<circle")
	})

	it("includes theme variables and base styles", () => {
		const html = buildVisualSrcDoc("<b>x</b>", { "--vscode-foreground": "#abcdef", "--vscode-font-size": "13px" })
		expect(html).toContain("--vscode-foreground: #abcdef;")
		expect(html).toContain("--vscode-font-size: 13px;")
		expect(html).toContain("border-collapse")
		expect(html).toContain("<b>x</b>")
	})
})

describe("parseVisualPayload", () => {
	it("parses valid payload", () => {
		expect(parseVisualPayload('{"title":"T","content":"<b>1</b>"}')).toEqual({ title: "T", content: "<b>1</b>" })
	})
	it("returns null for invalid or empty payload", () => {
		expect(parseVisualPayload("nope")).toBeNull()
		expect(parseVisualPayload('{"title":"T"}')).toBeNull()
	})
})
