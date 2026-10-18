import { describe, expect, it } from "vitest"
import { resolveSettingsTabId, SETTINGS_TABS } from "../SettingsView"

describe("SETTINGS_TABS", () => {
	// [SKYCODE] Порядок вкладок утверждён владельцем; «Отладка» всегда последняя и показывается только в debug-режиме
	it("lists tabs in the agreed order", () => {
		expect(SETTINGS_TABS.map((tab) => tab.id)).toEqual([
			"providers",
			"general",
			"permissions",
			"editing",
			"context",
			"terminal",
			"web",
			"voice",
			"indexing",
			"mcp",
			"advanced",
			"debug",
		])
	})

	it("maps legacy tab ids to the new tabs", () => {
		expect(resolveSettingsTabId("session-budget")).toBe("advanced")
		expect(resolveSettingsTabId("sessionBudget")).toBe("advanced")
		expect(resolveSettingsTabId("experiments")).toBe("advanced")
		expect(resolveSettingsTabId("browser")).toBe("web")
		expect(resolveSettingsTabId("terminal")).toBe("terminal")
	})
})
