import { describe, expect, it } from "vitest"
import { buildRichClipboardHtml, buildVisualDocument, buildVisualShadowHtml, parseVisualPayload } from "./visualSrcDoc"

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

	it("keeps plain text like 'online = yes' while still removing on* attributes", () => {
		const html = buildVisualShadowHtml('<table><tr><td>online = yes</td><td>once = true</td></tr></table><p onclick="x()">a</p>')
		expect(html).toContain("online = yes")
		expect(html).toContain("once = true")
		expect(html).not.toMatch(/onclick/i)
	})

	it("neutralizes model CSS that could escape the card", () => {
		const html = buildVisualShadowHtml(
			'<style>@import url("https://evil/x.css");:host{position:fixed;inset:0;z-index:99999}.a{position: sticky;contain:none;background:url(https://evil/p.png)}.b{fill:url(#g)}</style><div class="a" style="position:fixed;top:0">x</div>',
		)
		const modelPart = html.slice(html.indexOf('<div class="visual-root">'))
		expect(modelPart).not.toMatch(/:host|@import|evil|contain\s*:/i)
		expect(modelPart).not.toMatch(/position\s*:\s*(fixed|sticky)/i)
		expect(modelPart).toContain("position: absolute")
		expect(modelPart).toContain("url(#g)")
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

	it("drops whitespace between tags that Word turns into empty cells", () => {
		const html = buildRichClipboardHtml(
			"<table>\n  <thead>\n    <tr><th>a</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>b c</td></tr>\n  </tbody>\n</table>",
		)
		expect(html).not.toMatch(/>\s+</)
		expect(html).toContain("b c")
	})
})

describe("buildVisualDocument", () => {
	it("builds a full sanitized document for the editor tab", () => {
		const html = buildVisualDocument("<p onclick='x()'>hi</p><script>x()</script>", "Menu <b>")
		expect(html).toMatch(/^<!DOCTYPE html>/)
		expect(html).toContain("<title>Menu b</title>")
		expect(html).toContain("<p>hi</p>")
		expect(html).not.toMatch(/<script|onclick/i)
	})
})
