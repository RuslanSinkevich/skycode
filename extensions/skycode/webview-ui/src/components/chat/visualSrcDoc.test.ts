import { describe, expect, it } from "vitest"
import { buildRichClipboardHtml, buildVisualShadowHtml, parseVisualPayload } from "./visualSrcDoc"

describe("buildVisualShadowHtml", () => {
	it("strips script tags and on* attributes", () => {
		const html = buildVisualShadowHtml(
			'<p onclick="alert(1)">hi</p><script>alert(2)</script><svg onload="x()"><circle r="5"/></svg><img src="https://a/b.png" onerror=\'x()\'>',
		)
		expect(html).not.toMatch(/<script/i)
		expect(html).not.toMatch(/onclick|onload|onerror/i)
		expect(html).toContain("<p>hi</p>")
		expect(html).toContain("<circle")
	})

	it("wraps content with base styles that use theme variables", () => {
		const html = buildVisualShadowHtml("<b>x</b>")
		expect(html).toContain("var(--vscode-foreground")
		expect(html).toContain("contain: paint")
		expect(html).toContain('<div class="visual-root"><b>x</b></div>')
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

describe("buildRichClipboardHtml", () => {
	it("adds table borders as attributes for Word/Excel and strips scripts", () => {
		const html = buildRichClipboardHtml("<table><tr><td>1</td></tr></table><script>x()</script>")
		expect(html).toContain('<table border="1"')
		expect(html).toContain('<td style="border:1px solid #999')
		expect(html).not.toMatch(/<script/i)
	})
})
