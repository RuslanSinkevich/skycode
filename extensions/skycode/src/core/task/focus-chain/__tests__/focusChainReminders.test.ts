import { describe, it } from "mocha"
import "should"
import { TaskState } from "../../TaskState"
import { FocusChainManager } from "../index"

const make = (state: TaskState, mode: "act" | "plan" = "act") =>
	new FocusChainManager({
		taskId: "t",
		taskState: state,
		getMode: () => mode,
		stateManager: {} as any,
		postStateToWebview: async () => {},
		say: async () => undefined,
		focusChainSettings: { enabled: true, remindSkycodeInterval: 6 } as any,
	})

describe("FocusChainManager reminders", () => {
	it("sends full instructions once, then short reminders", () => {
		const state = new TaskState()
		state.apiRequestCount = 1
		const m = make(state)
		const first = m.generateFocusChainInstructions()
		first.length.should.be.above(300)
		state.apiRequestCount = 8
		const second = m.generateFocusChainInstructions()
		second.length.should.be.below(200)
	})

	it("short reminder reports progress", () => {
		const state = new TaskState()
		state.apiRequestCount = 5
		state.currentFocusChainChecklist = "- [x] a\n- [ ] b"
		const m = make(state)
		m.generateFocusChainInstructions()
		m.generateFocusChainInstructions().should.containEql("1/2 done")
	})

	it("throttles no-list reminders to once per 6 requests", () => {
		const state = new TaskState()
		const m = make(state)
		state.apiRequestCount = 1
		m.shouldIncludeFocusChainInstructions().should.be.true()
		m.generateFocusChainInstructions()
		state.apiRequestCount = 2
		m.shouldIncludeFocusChainInstructions().should.be.false()
		state.apiRequestCount = 7
		m.shouldIncludeFocusChainInstructions().should.be.true()
	})
})
