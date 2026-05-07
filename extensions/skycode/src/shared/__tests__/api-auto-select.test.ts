import { expect } from "chai"
import { describe, it } from "mocha"
import type { ApiConfiguration } from "@shared/api"
import { ALL_AUTO_PROVIDER_LABELS, pickAutoProvider } from "../api-auto-select"

const empty = {} as Partial<ApiConfiguration>

describe("pickAutoProvider", () => {
	it("falls back to default when nothing is configured", () => {
		const result = pickAutoProvider(empty)
		expect(result.reason).to.equal("default")
		expect(result.provider).to.equal("openai-native")
	})

	it("prefers Skycode account auth over any individual API key", () => {
		const cfg: any = {
			skycodeAccountId: "user-123",
			apiKey: "anthropic-test",
			openAiNativeApiKey: "openai-test",
		}
		const result = pickAutoProvider(cfg)
		expect(result.provider).to.equal("skycode")
		expect(result.reason).to.equal("auth")
	})

	it("prefers Anthropic over OpenAI when only those keys are present", () => {
		const cfg: any = {
			apiKey: "anthropic-test",
			openAiNativeApiKey: "openai-test",
		}
		const result = pickAutoProvider(cfg)
		expect(result.provider).to.equal("anthropic")
		expect(result.reason).to.equal("api-key")
	})

	it("treats blank-string keys as missing", () => {
		const cfg: any = { apiKey: "   " }
		const result = pickAutoProvider(cfg)
		expect(result.reason).to.equal("default")
	})

	it("picks GigaChat / YandexGPT over generic gateways when their keys are set", () => {
		const cfg: any = { gigaChatApiKey: "g-key" }
		const result = pickAutoProvider(cfg)
		expect(result.provider).to.equal("gigachat")
	})

	it("falls through to local runtimes only as a last resort", () => {
		const cfg: any = { ollamaBaseUrl: "http://localhost:11434" }
		const result = pickAutoProvider(cfg)
		expect(result.provider).to.equal("ollama")
		expect(result.reason).to.equal("local")
	})

	it("exposes the full provider list for UI override", () => {
		expect(ALL_AUTO_PROVIDER_LABELS.length).to.be.greaterThan(5)
		const skycode = ALL_AUTO_PROVIDER_LABELS.find((p) => p.provider === "skycode")
		expect(skycode?.label).to.equal("Skycode")
	})

	it("handles null/undefined config without throwing", () => {
		expect(pickAutoProvider(null).reason).to.equal("default")
		expect(pickAutoProvider(undefined).reason).to.equal("default")
	})
})
