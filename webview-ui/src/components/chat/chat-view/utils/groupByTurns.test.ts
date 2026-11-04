import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { describe, expect, it } from "vitest"
import { groupByTurns } from "./messageUtils"

const msg = (ts: number, say: SkycodeMessage["say"], text = ""): SkycodeMessage => ({ ts, type: "say", say, text })

describe("groupByTurns", () => {
	it("starts a task turn from the task message", () => {
		const task = msg(1, "text", "task")
		const reply = msg(2, "text", "reply")
		const feedback = msg(3, "user_feedback", "more")
		const reply2 = msg(4, "text", "reply2")
		const turns = groupByTurns([reply, feedback, reply2], task)
		expect(turns).toHaveLength(2)
		expect(turns[0].userMessage).toBe(task)
		expect(turns[0].isTaskTurn).toBe(true)
		expect(turns[0].items).toEqual([reply])
		expect(turns[1].userMessage).toBe(feedback)
		expect(turns[1].items).toEqual([reply2])
	})

	it("keeps items before the first user_feedback when there is no task message", () => {
		const reply = msg(2, "text", "reply")
		const feedback = msg(3, "user_feedback", "more")
		const turns = groupByTurns([reply, feedback])
		expect(turns).toHaveLength(2)
		expect(turns[0].userMessage).toBeUndefined()
		expect(turns[0].isTaskTurn).toBe(true)
		expect(turns[0].items).toEqual([reply])
		expect(turns[1].userMessage).toBe(feedback)
	})

	it("returns no turns for empty input without a task", () => {
		expect(groupByTurns([])).toEqual([])
	})
})
