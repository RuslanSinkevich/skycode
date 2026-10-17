import { describe, it } from "mocha"
import "should"
import {
	assignParents,
	buildReadSymbolOutput,
	extendStartUp,
	findSymbols,
	formatSymbol,
	notFoundMessage,
	parseSymbolParam,
	type SymbolDef,
} from "../readSymbolCore"

const defs: SymbolDef[] = [
	{ name: "Doc", kind: "class", startLine: 3, endLine: 20 },
	{ name: "Save", kind: "method", startLine: 5, endLine: 9 },
	{ name: "Load", kind: "method", startLine: 11, endLine: 15 },
	{ name: "Other", kind: "class", startLine: 22, endLine: 30 },
	{ name: "Save", kind: "method", startLine: 24, endLine: 28 },
]

describe("readSymbolCore", () => {
	it("parseSymbolParam splits, trims, dedupes and caps at 5", () => {
		parseSymbolParam(" A, B ,A,'C'").should.deepEqual(["A", "B", "C"])
		parseSymbolParam("a,b,c,d,e,f,g").length.should.equal(5)
		parseSymbolParam(undefined).should.deepEqual([])
	})

	it("assignParents nests methods in classes", () => {
		const r = assignParents(defs)
		r.find((d) => d.startLine === 5)!.parent!.should.equal("Doc")
		r.find((d) => d.startLine === 24)!.parent!.should.equal("Other")
		;(r.find((d) => d.startLine === 3)!.parent === undefined).should.be.true()
	})

	it("matches exactly, then case-insensitively, and by Class.Method", () => {
		const d = assignParents(defs)
		findSymbols(d, ["Load"])[0].matches.map((m) => m.startLine).should.deepEqual([11])
		findSymbols(d, ["load"])[0].matches.map((m) => m.startLine).should.deepEqual([11])
		findSymbols(d, ["Save"])[0].matches.map((m) => m.startLine).should.deepEqual([5, 24])
		findSymbols(d, ["Other.Save"])[0].matches.map((m) => m.startLine).should.deepEqual([24])
		findSymbols(d, ["other.save"])[0].matches.map((m) => m.startLine).should.deepEqual([24])
		findSymbols(d, ["Doc.Other"])[0].matches.should.deepEqual([])
	})

	it("extendStartUp pulls in comments and attributes, capped", () => {
		const lines = ["x", "/// doc", "[Attr]", "void F() {}"]
		extendStartUp(lines, 4).should.equal(2)
		extendStartUp(["a", "b", "void F()"], 3).should.equal(3)
		const many = [...Array.from({ length: 30 }, () => "// c"), "void F()"]
		extendStartUp(many, 31).should.equal(16)
	})

	it("formatSymbol adds header, real line numbers and leading comment", () => {
		const lines = ["", "// note", "void F() {", "}", "tail"]
		const out = formatSymbol(lines, { name: "F", kind: "function", startLine: 3, endLine: 4 }, "a.ts")
		out.split("\n")[0].should.equal("// a.ts lines 2-4 (function F)")
		out.should.containEql("     2|// note")
		out.should.containEql("     4|}")
		out.should.not.containEql("tail")
	})

	it("formatSymbol caps at 400 lines", () => {
		const lines = Array.from({ length: 1000 }, (_, i) => `l${i + 1}`)
		const out = formatSymbol(lines, { name: "Big", kind: "class", startLine: 10, endLine: 900 }, "b.cs")
		out.split("\n")[0].should.equal("// b.cs lines 10-409 (class Big)")
		out.should.containEql("[... symbol continues to line 900 — use read_file with start_line/end_line]")
		out.should.not.containEql("l410")
	})

	it("notFoundMessage lists up to 15 names", () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ name: `N${i}`, kind: "function", startLine: i + 1, endLine: i + 1 }))
		const msg = notFoundMessage("X", "f.ts", many)
		msg.should.startWith('Symbol "X" not found in f.ts. Symbols in this file: N0, N1')
		msg.should.containEql("N14")
		msg.should.not.containEql("N15,")
		msg.should.containEql("+5 more")
		notFoundMessage("X", "f.ts", assignParents(defs)).should.containEql("Doc, Doc.Save, Doc.Load, Other, Other.Save")
	})

	it("buildReadSymbolOutput joins found symbols and not-found messages", () => {
		const content = Array.from({ length: 30 }, (_, i) => `line${i + 1}`).join("\n")
		const out = buildReadSymbolOutput(content, defs, ["Doc.Load", "Nope"], "a.cs")
		out.should.containEql("// a.cs lines 11-15 (method Doc.Load)")
		out.should.containEql('Symbol "Nope" not found in a.cs')
	})
})
