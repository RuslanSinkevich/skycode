import { describe, it } from "mocha"
import "should"
import { registerToolCall, repeatNote, toolCallSignature } from "../toolCallSignature"

describe("toolCallSignature", () => {
	it("ignores key order and task_progress", () => {
		toolCallSignature("search_files", { regex: "a", path: "src", task_progress: "- [ ] x" }).should.equal(
			toolCallSignature("search_files", { path: "src", regex: "a" }),
		)
	})
	it("differs for different params or names", () => {
		toolCallSignature("search_files", { regex: "a" }).should.not.equal(toolCallSignature("search_files", { regex: "b" }))
		toolCallSignature("a", {}).should.not.equal(toolCallSignature("b", {}))
	})
})

describe("registerToolCall", () => {
	it("flags an identical repeat", () => {
		const recent: string[] = []
		registerToolCall(recent, "read_diagnostics", {}).should.be.false()
		registerToolCall(recent, "read_diagnostics", {}).should.be.true()
	})
	it("does not flag different params", () => {
		const recent: string[] = []
		registerToolCall(recent, "search_files", { path: "a" })
		registerToolCall(recent, "search_files", { path: "b" }).should.be.false()
	})
	it("resets after a modifying tool, including execute_command", () => {
		for (const tool of ["write_to_file", "replace_in_file", "replace_text", "delete_block", "apply_patch", "execute_command"]) {
			const recent: string[] = []
			registerToolCall(recent, "search_files", { path: "a" })
			registerToolCall(recent, tool, { path: "a" }).should.be.false()
			registerToolCall(recent, "search_files", { path: "a" }).should.be.false()
		}
	})
	it("never nags exempt tools", () => {
		for (const tool of [
			"attempt_completion",
			"ask_followup_question",
			"plan_mode_respond",
			"act_mode_respond",
			"check_background_command",
		]) {
			const recent: string[] = []
			registerToolCall(recent, tool, { x: "1" })
			registerToolCall(recent, tool, { x: "1" }).should.be.false()
		}
	})
	it("remembers only the last 8 calls", () => {
		const recent: string[] = []
		registerToolCall(recent, "search_files", { path: "first" })
		for (let i = 0; i < 8; i++) {
			registerToolCall(recent, "search_files", { path: `p${i}` })
		}
		registerToolCall(recent, "search_files", { path: "first" }).should.be.false()
	})
	it("note mentions the tool name", () => {
		repeatNote("search_files").should.containEql("exact search_files call")
	})
})
