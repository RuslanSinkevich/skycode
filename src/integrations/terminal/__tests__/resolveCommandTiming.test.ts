import { describe, it } from "mocha"
import "should"
import { DEFAULT_COMMAND_TIMEOUT_SECONDS, resolveCommandTiming, VSCODE_AUTO_PROCEED_AFTER_MS } from "../constants"

/**
 * Tests for resolveCommandTiming — the single place that decides how long a
 * command may block the agent.
 *
 * The rule: a timeout the model passed explicitly always wins and switches the
 * soft auto-proceed off, otherwise the visible VS Code terminal returns control
 * after VSCODE_AUTO_PROCEED_AFTER_MS and background execution after
 * DEFAULT_COMMAND_TIMEOUT_SECONDS.
 */
describe("resolveCommandTiming", () => {
	describe("explicit timeout from the model", () => {
		it("wins in the VSCode terminal and disables auto-proceed", () => {
			const timing = resolveCommandTiming(600, "vscode")
			timing.timeoutSeconds.should.equal(600)
			;(timing.autoProceedAfterMs === undefined).should.be.true()
		})

		it("wins in a standalone terminal", () => {
			const timing = resolveCommandTiming(300, "standalone")
			timing.timeoutSeconds.should.equal(300)
			;(timing.autoProceedAfterMs === undefined).should.be.true()
		})
	})

	describe("no timeout from the model", () => {
		it("keeps the Cursor-style auto-proceed in the VSCode terminal", () => {
			const timing = resolveCommandTiming(undefined, "vscode")
			timing.timeoutSeconds.should.equal(DEFAULT_COMMAND_TIMEOUT_SECONDS)
			timing.autoProceedAfterMs?.should.equal(VSCODE_AUTO_PROCEED_AFTER_MS)
		})

		it("uses only the hard timeout for background execution", () => {
			const timing = resolveCommandTiming(undefined, "standalone")
			timing.timeoutSeconds.should.equal(DEFAULT_COMMAND_TIMEOUT_SECONDS)
			;(timing.autoProceedAfterMs === undefined).should.be.true()
		})
	})

	describe("invalid values fall back to the defaults", () => {
		const invalid: Array<[string, number]> = [
			["zero", 0],
			["negative", -5],
			["NaN", Number.NaN],
			["Infinity", Number.POSITIVE_INFINITY],
		]

		for (const [name, value] of invalid) {
			it(`ignores ${name}`, () => {
				const timing = resolveCommandTiming(value, "vscode")
				timing.timeoutSeconds.should.equal(DEFAULT_COMMAND_TIMEOUT_SECONDS)
				timing.autoProceedAfterMs?.should.equal(VSCODE_AUTO_PROCEED_AFTER_MS)
			})
		}
	})
})
