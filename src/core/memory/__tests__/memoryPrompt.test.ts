import { describe, it } from "mocha"
import "should"
import { getSystemPrompt } from "@/core/prompts/system-prompt"
import type { SystemPromptContext } from "@/core/prompts/system-prompt/types"
import type { McpHub } from "@/services/mcp/McpHub"
import { mockProviderInfo } from "../../prompts/system-prompt/__tests__/integration.test"

// [SKYCODE] remember/forget должны появляться в промпте только при включённой памяти — в том числе для Qwen.
const baseContext = (memoryEnabled: boolean, modelId: string): SystemPromptContext => ({
	cwd: "/test/project",
	ide: "TestIde",
	supportsBrowserUse: false,
	mcpHub: {
		getServers: () => [],
		getMcpServersPath: () => "/test/mcp-servers",
		getSettingsDirectoryPath: () => "/test/settings",
		clientVersion: "1.0.0",
		disposables: [],
	} as unknown as McpHub,
	focusChainSettings: { enabled: false, remindSkycodeInterval: 6 },
	browserSettings: { viewport: { width: 1280, height: 720 } },
	isTesting: true,
	providerInfo: { ...mockProviderInfo, providerId: "openai", model: { ...mockProviderInfo.model, id: modelId } },
	memoryEnabled,
})

describe("memory tools in the system prompt", () => {
	for (const modelId of ["Qwen/Qwen3.8-27B-FP8", "claude-sonnet-4"]) {
		it(`${modelId}: present only when memory is enabled`, async () => {
			const on = await getSystemPrompt(baseContext(true, modelId))
			on.systemPrompt.should.containEql("remember")
			on.systemPrompt.should.containEql("forget")
			on.systemPrompt.should.containEql("evidence")

			const off = await getSystemPrompt(baseContext(false, modelId))
			off.systemPrompt.should.not.containEql("## remember")
			off.systemPrompt.should.not.containEql("<evidence>")
		})
	}
})
