import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { describe, expect, it } from "vitest"
import { formatTokens, getContextLevel, getContextTokens, getFillRatio, getTokensUntilCompaction } from "./contextUsage"

const apiReq = (info: object | string): SkycodeMessage =>
	({ ts: 1, type: "say", say: "api_req_started", text: typeof info === "string" ? info : JSON.stringify(info) }) as SkycodeMessage

describe("contextUsage", () => {
	it("formatTokens", () => {
		expect(formatTokens(43500)).toBe("43.5k")
		expect(formatTokens(128000)).toBe("128k")
		expect(formatTokens(950)).toBe("950")
		expect(formatTokens(1_200_000)).toBe("1.2m")
	})

	it("getContextTokens берёт последний запрос с токенами и пропускает пустые и битые", () => {
		const messages = [
			apiReq({ tokensIn: 10, tokensOut: 5 }),
			apiReq({ tokensIn: 1000, tokensOut: 200, cacheReads: 300, cacheWrites: 100 }),
			apiReq({}),
			apiReq("{broken"),
		]
		expect(getContextTokens(messages)).toBe(1600)
		expect(getContextTokens([])).toBe(0)
	})

	it("getFillRatio", () => {
		expect(getFillRatio(43500, 128000)).toBeCloseTo(0.34, 2)
		expect(getFillRatio(500, 0)).toBe(0)
		expect(getFillRatio(300, 100)).toBe(1)
	})

	it("getTokensUntilCompaction", () => {
		expect(getTokensUntilCompaction(43500, 90500)).toBe(47000)
		expect(getTokensUntilCompaction(100000, 90500)).toBe(0)
		expect(getTokensUntilCompaction(100, undefined)).toBeUndefined()
	})

	it("getContextLevel по порогу автосжатия", () => {
		expect(getContextLevel(60, 100, 200)).toBe("normal")
		expect(getContextLevel(71, 100, 200)).toBe("warning")
		expect(getContextLevel(91, 100, 200)).toBe("critical")
		expect(getContextLevel(150, undefined, 200)).toBe("warning")
		expect(getContextLevel(10, undefined, 0)).toBe("normal")
	})
})
