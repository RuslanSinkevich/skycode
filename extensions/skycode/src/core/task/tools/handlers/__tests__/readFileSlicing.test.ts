import { describe, it } from "mocha"
import "should"
import {
	canStubReread,
	hashContent,
	parseLineParam,
	READ_FILE_MAX_LINES,
	type ReadFileCacheEntry,
	sliceForRead,
	unchangedStub,
} from "../readFileSlicing"

const make = (n: number) => Array.from({ length: n }, (_, i) => `l${i + 1}`).join("\n")

describe("parseLineParam", () => {
	it("parses positive integers, ignores junk", () => {
		;(parseLineParam("5") as number).should.equal(5)
		;(parseLineParam(" 12 ") as number).should.equal(12)
		;(parseLineParam(undefined) === undefined).should.be.true()
		;(parseLineParam("abc") === undefined).should.be.true()
		;(parseLineParam("0") === undefined).should.be.true()
		;(parseLineParam("-3") === undefined).should.be.true()
	})
})

describe("sliceForRead", () => {
	it("returns the whole small file with numbers and no note", () => {
		const r = sliceForRead("a\nb\nc")
		r.output.should.equal("     1|a\n     2|b\n     3|c")
		r.partial.should.be.false()
		r.totalLines.should.equal(3)
	})
	it("caps big files at 2000 lines with a note", () => {
		const r = sliceForRead(make(2500))
		const lines = r.output.split("\n")
		lines.length.should.equal(READ_FILE_MAX_LINES + 1)
		lines[1999].should.equal("  2000|l2000")
		lines[2000].should.equal(
			"[File has 2500 lines; showing 1-2000. Call read_file again with start_line/end_line to read more.]",
		)
		r.partial.should.be.true()
	})
	it("returns an exact range with real line numbers", () => {
		const r = sliceForRead(make(100), 10, 12)
		r.output.should.startWith("    10|l10\n    11|l11\n    12|l12\n[File has 100 lines; showing 10-12.")
	})
	it("start only reads to the end", () => {
		const r = sliceForRead(make(5), 4)
		r.output.should.equal("     4|l4\n     5|l5\n[File has 5 lines; showing 4-5.]")
	})
	it("caps a single range at 2000 lines", () => {
		const r = sliceForRead(make(5000), 100, 4000)
		r.output.should.containEql("showing 100-2099.")
	})
	it("whole-file range has no note", () => {
		sliceForRead(make(3), 1, 3).partial.should.be.false()
	})
	it("friendly message when out of range", () => {
		sliceForRead(make(10), 50).output.should.equal("File has 10 lines; start_line 50 is beyond the end.")
		sliceForRead(make(10), 5, 2).output.should.containEql("before start_line")
	})
	it("empty text is returned as is", () => {
		sliceForRead("").output.should.equal("")
	})
})

describe("canStubReread", () => {
	const entry = (over: Partial<ReadFileCacheEntry> = {}): ReadFileCacheEntry => ({
		hash: hashContent("x"),
		historyLength: 20,
		deletedRangeKey: "",
		totalLines: 3,
		...over,
	})
	it("stubs identical content with no truncation", () => {
		canStubReread(entry(), hashContent("x"), undefined).should.be.true()
	})
	it("does not stub after history got shorter (rolled back messages)", () => {
		canStubReread(entry(), hashContent("x"), undefined, 25).should.be.true()
		canStubReread(entry(), hashContent("x"), undefined, 10).should.be.false()
	})
	it("does not stub after the history was rewritten (generation changed)", () => {
		canStubReread(entry({ generation: 1 }), hashContent("x"), undefined, 25, 1).should.be.true()
		canStubReread(entry({ generation: 1 }), hashContent("x"), undefined, 25, 2).should.be.false()
		canStubReread(entry(), hashContent("x"), undefined, 25, 1).should.be.false()
	})
	it("does not stub when content changed or no entry", () => {
		canStubReread(entry(), hashContent("y"), undefined).should.be.false()
		canStubReread(undefined, hashContent("x"), undefined).should.be.false()
	})
	it("does not stub when the deleted range changed (condense/truncation)", () => {
		canStubReread(entry(), hashContent("x"), [2, 10]).should.be.false()
		canStubReread(entry({ deletedRangeKey: "2-10" }), hashContent("x"), [2, 14]).should.be.false()
	})
	it("does not stub when the earlier result lies inside the deleted range", () => {
		canStubReread(entry({ historyLength: 8, deletedRangeKey: "2-10" }), hashContent("x"), [2, 10]).should.be.false()
		canStubReread(entry({ historyLength: 30, deletedRangeKey: "2-10" }), hashContent("x"), [2, 10]).should.be.true()
	})
	it("stub text mentions line count and escape hatch", () => {
		unchangedStub(7).should.containEql("(7 lines)").and.containEql("start_line=1")
	})
})
