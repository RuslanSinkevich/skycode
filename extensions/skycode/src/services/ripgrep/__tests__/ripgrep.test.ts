import { describe, it } from "mocha"
import "should"
import { resolveRipgrepRun, timeoutNote } from "../index"

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
