import { expect } from "chai"
import type { ApiHandler } from "@core/api"
import { getAutoCompactThresholdTokens, getContextUsageLimits } from "../context-window-utils"

function fakeApi(contextWindow: number): ApiHandler {
	return { getModel: () => ({ id: "test-model", info: { contextWindow } }) } as unknown as ApiHandler
}

describe("getContextUsageLimits", () => {
	it("возвращает окно модели и тот же порог, что и getAutoCompactThresholdTokens", () => {
		const api = fakeApi(128_000)
		const limits = getContextUsageLimits(api, undefined)
		expect(limits.contextWindow).to.equal(128_000)
		expect(limits.autoCompactThresholdTokens).to.equal(getAutoCompactThresholdTokens(api, undefined))
	})

	it("учитывает настройку порога и не превышает окно", () => {
		const api = fakeApi(128_000)
		const limits = getContextUsageLimits(api, 0.1)
		expect(limits.autoCompactThresholdTokens).to.equal(12_800)
		expect(getContextUsageLimits(api, 1).autoCompactThresholdTokens).to.be.at.most(128_000)
	})
})
