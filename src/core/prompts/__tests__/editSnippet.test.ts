import { describe, it } from "mocha"
import "should"
import { buildEditEcho, changedRegions } from "../editSnippet"

const make = (n: number) => Array.from({ length: n }, (_, i) => `l${i + 1}`)

describe("buildEditEcho", () => {
	it("keeps the full content for small files", () => {
		const orig = make(100).join("\n")
		const fin = orig.replace("l50", "X")
		const r = buildEditEcho(fin, orig)
		r.partial.should.be.false()
		r.body.should.equal(fin)
	})
	it("keeps the full content when the original is unknown or empty", () => {
		const fin = make(400).join("\n")
		buildEditEcho(fin, undefined).partial.should.be.false()
		buildEditEcho(fin, "").partial.should.be.false()
	})
	it("shows only changed regions with context and real line numbers", () => {
		const orig = make(400)
		const fin = [...orig]
		fin[99] = "CHANGED"
		const r = buildEditEcho(fin.join("\n"), orig.join("\n"))
		r.partial.should.be.true()
		r.totalLines.should.equal(400)
		const lines = r.body.split("\n")
		lines.length.should.equal(11)
		lines[0].should.equal("    95|l95")
		lines[5].should.equal("   100|CHANGED")
		lines[10].should.equal("   105|l105")
	})
	it("separates distant regions with ... and merges close ones", () => {
		const orig = make(400)
		const fin = [...orig]
		fin[9] = "A"
		fin[14] = "B"
		fin[299] = "C"
		const r = buildEditEcho(fin.join("\n"), orig.join("\n"))
		r.body.split("\n...\n").length.should.equal(2)
		r.body.should.containEql("    10|A").and.containEql("    15|B").and.containEql("   300|C")
	})
	it("handles inserted and deleted lines", () => {
		const orig = make(400)
		const ins = [...orig.slice(0, 200), "N1", "N2", ...orig.slice(200)]
		buildEditEcho(ins.join("\n"), orig.join("\n")).body.should.containEql("   201|N1").and.containEql("   202|N2")
		const del = [...orig.slice(0, 200), ...orig.slice(205)]
		const r = buildEditEcho(del.join("\n"), orig.join("\n"))
		r.partial.should.be.true()
		r.body.should.containEql("   200|l200").and.containEql("   201|l206")
	})
	it("changedRegions merges touching regions", () => {
		changedRegions("a\nb\nc\nd\ne\nf\n", "a\nB\nc\nd\ne\nF\n", 6, 2).should.deepEqual([[0, 6]])
	})
})
