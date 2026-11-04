import { describe, it } from "mocha"
import "should"
import * as path from "path"
import { formatResults, resolveRipgrepRun, timeoutNote } from "../index"

describe("resolveRipgrepRun", () => {
	it("keeps matches even when stderr is non-empty", () => {
		const run = resolveRipgrepRun({ output: "{}\n", errorOutput: "permission denied", timedOut: false })
		run.should.deepEqual({ output: "{}\n", timedOut: false })
	})
	it("keeps partial output on timeout", () => {
		resolveRipgrepRun({ output: "{}\n", errorOutput: "", timedOut: true }).timedOut.should.be.true()
	})
	it("empty output on timeout is not an error", () => {
		resolveRipgrepRun({ output: "", errorOutput: "", timedOut: true }).should.deepEqual({ output: "", timedOut: true })
	})
	it("throws with stderr text when there is no output", () => {
		;(() => resolveRipgrepRun({ output: "", errorOutput: "regex parse error", timedOut: false })).should.throw(
			/regex parse error/,
		)
	})
	it("throws on process error without output", () => {
		;(() => resolveRipgrepRun({ output: "", errorOutput: "", processError: "ENOENT", timedOut: false })).should.throw(/ENOENT/)
	})
	it("timeout note mentions 45s", () => {
		timeoutNote().should.containEql("45s")
	})
})

describe("formatResults", () => {
	it("prefixes every line with its real line number", () => {
		const cwd = path.resolve("/repo")
		const output = formatResults(
			[{ filePath: path.join(cwd, "a.cs"), line: 253, column: 0, match: "x = 1\n", beforeContext: ["{\n"], afterContext: ["}\n"] }],
			cwd,
		)
		output.should.equal("Found 1 result.\n\na.cs\n│----\n│   252|{\n│   253|x = 1\n│   254|}\n│----")
	})
})
