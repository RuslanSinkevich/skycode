import { expect } from "chai"
import { describe, it } from "mocha"
import { outputLimitOptions, truncateOutput } from "../truncateOutput"

const makeLines = (n: number, prefix = "line") => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n")

describe("truncateOutput", () => {
	it("returns short output unchanged", () => {
		const s = makeLines(50)
		expect(truncateOutput(s)).to.equal(s)
	})

	it("keeps 40 head and 120 tail lines for long output", () => {
		const out = truncateOutput(makeLines(1000))
		const lines = out.split("\n")
		expect(lines[0]).to.equal("line 1")
		expect(lines[39]).to.equal("line 40")
		expect(out).to.contain("[840 lines omitted")
		expect(lines[lines.length - 1]).to.equal("line 1000")
		expect(out).to.contain("line 881\n")
		expect(out).to.not.contain("line 880\n")
	})

	it("caps total chars, cutting the head first", () => {
		const long = Array.from({ length: 150 }, (_, i) => `${i + 1} ${"x".repeat(200)}`).join("\n")
		const out = truncateOutput(long)
		expect(out.length).to.be.lessThan(12000 + 300)
		expect(out).to.contain("lines omitted")
		expect(out.endsWith(`150 ${"x".repeat(200)}`)).to.equal(true)
	})

	it("keeps the tail of a single huge line", () => {
		const out = truncateOutput("a".repeat(50000) + "END")
		expect(out.length).to.be.lessThan(12400)
		expect(out.endsWith("END")).to.equal(true)
	})

	it("scales options from a user limit but never above 200", () => {
		expect(outputLimitOptions(500).maxLines).to.equal(200)
		expect(outputLimitOptions(100)).to.deep.equal({ maxLines: 100, headLines: 20, tailLines: 60 })
	})
})
