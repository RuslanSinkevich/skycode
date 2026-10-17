import { expect } from "chai"
import { describe, it } from "mocha"
import { closestMatchHint, findClosestMatch } from "../closestMatch"
import { constructNewFileContent } from "../diff"

const file = [
	"import fs from 'fs'",
	"",
	"function add(a: number, b: number) {",
	"\tconst sum = a + b",
	"\treturn sum",
	"}",
	"",
	"function sub(a: number, b: number) {",
	"\treturn a - b",
	"}",
].join("\n")

describe("closestMatch", () => {
	it("finds the region with different whitespace", () => {
		const search = "function add(a: number, b: number) {\n    const sum = a+b\n    return sum\n}"
		const m = findClosestMatch(file, search)
		expect(m?.startLine).to.equal(3)
		expect(m?.endLine).to.equal(6)
	})

	it("formats hint with line numbers", () => {
		const hint = closestMatchHint(file, "function sub(a: number, b: number) {\n\treturn a - b + 1\n}")
		expect(hint).to.contain("Closest match in the file (lines 8-10)")
		expect(hint).to.contain("     8|function sub(a: number, b: number) {")
	})

	it("says no similar region for unrelated text", () => {
		const hint = closestMatchHint(file, "qqq www eee\nrrr ttt yyy")
		expect(hint).to.contain("No similar region found")
	})

	it("skips huge files", () => {
		const big = Array.from({ length: 20001 }, (_, i) => `l${i}`).join("\n")
		expect(findClosestMatch(big, "l5")).to.equal(undefined)
	})

	it("is appended to the diff error", async () => {
		const diff = "------- SEARCH\nfunction sub(a: number) {\n\treturn a - b\n=======\nx\n+++++++ REPLACE"
		let msg = ""
		try {
			await constructNewFileContent(diff, file, true, "v2")
		} catch (e) {
			msg = (e as Error).message
		}
		expect(msg).to.contain("does not match anything in the file")
		expect(msg).to.contain("Closest match in the file")
	})
})
