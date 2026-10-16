import { describe, it } from "mocha"
import "should"
import { buildTabs, deriveTabStatus, deriveTabTitle, planRestoredTabs, toPersistedTabs } from "../tabs"

const ask = (a: string, partial = false) => ({ type: "ask" as const, ask: a as any, partial })
const say = (s: string, text?: string) => ({ type: "say" as const, say: s as any, text })

describe("deriveTabStatus", () => {
	it("idle without a task or without messages", () => {
		deriveTabStatus({ hasTask: false, messages: [] }).should.equal("idle")
		deriveTabStatus({ hasTask: true, messages: [] }).should.equal("idle")
	})
	it("placeholder is stopped", () => {
		deriveTabStatus({ hasTask: false, isPlaceholder: true, messages: [] }).should.equal("stopped")
	})
	it("queued wins while waiting for an API slot", () => {
		deriveTabStatus({ hasTask: true, isWaitingForApiSlot: true, messages: [ask("tool")] }).should.equal("queued")
	})
	it("blocking asks are awaiting", () => {
		for (const a of [
			"tool",
			"command",
			"followup",
			"api_req_failed",
			"browser_action_launch",
			"use_mcp_server",
			"plan_mode_respond",
			"mistake_limit_reached",
		]) {
			deriveTabStatus({ hasTask: true, messages: [say("task"), ask(a)] }).should.equal("awaiting")
		}
	})
	it("completion_result is done, resume asks are stopped", () => {
		deriveTabStatus({ hasTask: true, messages: [ask("completion_result")] }).should.equal("done")
		deriveTabStatus({ hasTask: true, messages: [ask("resume_task")] }).should.equal("stopped")
		deriveTabStatus({ hasTask: true, messages: [ask("resume_completed_task")] }).should.equal("stopped")
	})
	it("partial ask and streaming says are running", () => {
		deriveTabStatus({ hasTask: true, messages: [ask("tool", true)] }).should.equal("running")
		deriveTabStatus({ hasTask: true, messages: [say("task"), say("api_req_started")] }).should.equal("running")
		deriveTabStatus({ hasTask: true, messages: [ask("command_output")] }).should.equal("running")
	})
	it("aborted task without resume ask is stopped", () => {
		deriveTabStatus({ hasTask: true, aborted: true, messages: [say("text")] }).should.equal("stopped")
	})
})

describe("deriveTabTitle", () => {
	it("uses the first task message, single line", () => {
		deriveTabTitle([say("task", "  fix\n  the   bug \n"), say("task", "second")], "hist").should.equal("fix the bug")
	})
	it("uses the first say text message (Skycode writes the task as text)", () => {
		deriveTabTitle([say("text", "Проверка установки"), say("api_req_started", "{}")]).should.equal("Проверка установки")
	})
	it("never uses service JSON as a title", () => {
		deriveTabTitle([say("api_req_started", "{\"tokensIn\":1}")], "{\"tokensIn\":29375}").should.equal("")
		deriveTabTitle([], "{\"tokensIn\":29375}").should.equal("")
	})
	it("falls back to history text and truncates", () => {
		deriveTabTitle([], "from history").should.equal("from history")
		deriveTabTitle([say("task", "x".repeat(500))]).length.should.equal(200)
		deriveTabTitle([]).should.equal("")
	})
})

describe("buildTabs", () => {
	it("maps sources and uses placeholder title", () => {
		const tabs = buildTabs([
			{ sessionId: "s1", taskId: "t1", status: "running", title: "A", ts: 1 },
			{ sessionId: "s2", taskId: "t2", placeholderTitle: "B", status: "stopped", title: "", ts: 2 },
			{ sessionId: "s3", status: "idle", title: "", ts: 3 },
		])
		tabs.should.deepEqual([
			{ id: "s1", taskId: "t1", title: "A", status: "running", ts: 1 },
			{ id: "s2", taskId: "t2", title: "B", status: "stopped", ts: 2 },
			{ id: "s3", taskId: "", title: "", status: "idle", ts: 3 },
		])
	})
})

describe("persistence round-trip", () => {
	it("skips empty tabs and keeps active only if saved", () => {
		const tabs = [
			{ id: "s1", taskId: "t1" },
			{ id: "s2", taskId: "" },
		]
		toPersistedTabs(tabs, "s2").should.deepEqual({ openTabs: [{ sessionId: "s1", taskId: "t1" }], activeTabId: undefined })
		toPersistedTabs(tabs, "s1").activeTabId!.should.equal("s1")
	})
	it("restore drops tasks missing from history and duplicates, picks fallback active", () => {
		const saved = [
			{ sessionId: "s1", taskId: "t1" },
			{ sessionId: "s2", taskId: "gone" },
			{ sessionId: "s3", taskId: "t3" },
			{ sessionId: "s4", taskId: "t3" },
		]
		const r = planRestoredTabs(saved, "s2", new Set(["t1", "t3"]))
		r.tabs.map((t) => t.sessionId).should.deepEqual(["s1", "s3"])
		r.activeId!.should.equal("s1")
		planRestoredTabs(saved, "s3", new Set(["t1", "t3"])).activeId!.should.equal("s3")
		planRestoredTabs(undefined, undefined, new Set()).should.deepEqual({ tabs: [], activeId: undefined })
	})
})
