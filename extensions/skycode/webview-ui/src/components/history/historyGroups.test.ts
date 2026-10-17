import type { HistoryItem } from "@shared/HistoryItem"
import { describe, expect, it } from "vitest"
import { displayTaskTitle, filterHistoryForDrawer, getHistoryGroupKey, groupHistoryByDate } from "./historyGroups"

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Среда, 14 октября 2026, 15:00 по локальному времени
const NOW = new Date(2026, 9, 14, 15, 0, 0).getTime()

const item = (id: string, ts: number, task = `Task ${id}`): HistoryItem => ({
	id,
	ts,
	task,
	tokensIn: 0,
	tokensOut: 0,
	totalCost: 0,
})

describe("getHistoryGroupKey", () => {
	it("splits by calendar days, not by 24-hour windows", () => {
		const midnight = new Date(2026, 9, 14, 0, 0, 0).getTime()
		expect(getHistoryGroupKey(NOW - HOUR, NOW)).toBe("today")
		expect(getHistoryGroupKey(midnight, NOW)).toBe("today")
		expect(getHistoryGroupKey(midnight - 1, NOW)).toBe("yesterday")
		expect(getHistoryGroupKey(midnight - DAY, NOW)).toBe("yesterday")
		expect(getHistoryGroupKey(midnight - DAY - 1, NOW)).toBe("thisWeek")
		expect(getHistoryGroupKey(midnight - 6 * DAY, NOW)).toBe("thisWeek")
		expect(getHistoryGroupKey(midnight - 6 * DAY - 1, NOW)).toBe("older")
	})
})

describe("groupHistoryByDate", () => {
	it("returns non-empty groups in order with newest items first", () => {
		const groups = groupHistoryByDate(
			[item("old", NOW - 30 * DAY), item("a", NOW - 2 * HOUR), item("week", NOW - 4 * DAY), item("b", NOW - HOUR)],
			NOW,
		)
		expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
			["today", ["b", "a"]],
			["thisWeek", ["week"]],
			["older", ["old"]],
		])
	})
})

describe("filterHistoryForDrawer", () => {
	const items = [item("1", NOW, "Fix the Login bug"), item("2", NOW, "Write docs"), item("3", NOW, "")]

	it("drops tasks already open in tabs, keeps untitled ones", () => {
		expect(filterHistoryForDrawer(items, new Set(["1"]), "").map((i) => i.id)).toEqual(["2", "3"])
	})

	it("hides service JSON instead of a title", () => {
		expect(displayTaskTitle('{"tokensIn":1}', "Без названия")).toBe("Без названия")
		expect(displayTaskTitle("Fix bug", "Без названия")).toBe("Fix bug")
	})

	it("filters by text ignoring case", () => {
		expect(filterHistoryForDrawer(items, new Set(), "login").map((i) => i.id)).toEqual(["1"])
	})
})
