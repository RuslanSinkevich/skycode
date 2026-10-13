import { ApiConfiguration, ModelInfo, QwenApiRegions } from "@shared/api"
import { getApiSettingsMode, Mode } from "@shared/storage/types"
import { SkycodeStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { SkycodeTool } from "@/shared/tools"
import { AnthropicHandler } from "./providers/anthropic"
import { ClaudeCodeHandler } from "./providers/claude-code"
import { DeepSeekHandler } from "./providers/deepseek"
import { GeminiHandler } from "./providers/gemini"
import { LiteLlmHandler } from "./providers/litellm"
import { LmStudioHandler } from "./providers/lmstudio"
import { OllamaHandler } from "./providers/ollama"
import { OpenAiHandler } from "./providers/openai"
import { OpenAiCodexHandler } from "./providers/openai-codex"
import { OpenAiNativeHandler } from "./providers/openai-native"
import { OpenRouterHandler } from "./providers/openrouter"
import { QwenHandler } from "./providers/qwen"
import { QwenCodeHandler } from "./providers/qwen-code"
import { QwenWebHandler } from "./providers/qwen-web"
import { VsCodeLmHandler } from "./providers/vscode-lm"
import { GigaChatHandler } from "./providers/gigachat"
import { YandexGptHandler } from "./providers/yandexgpt"
import { ApiStream, ApiStreamUsageChunk } from "./transform/stream"

export type CommonApiHandlerOptions = {
	onRetryAttempt?: ApiConfiguration["onRetryAttempt"]
}
export interface ApiHandler {
	createMessage(systemPrompt: string, messages: SkycodeStorageMessage[], tools?: SkycodeTool[], useResponseApi?: boolean): ApiStream
	getModel(): ApiHandlerModel
	getApiStreamUsage?(): Promise<ApiStreamUsageChunk | undefined>
	abort(): void
}

export interface ApiHandlerModel {
	id: string
	info: ModelInfo
}

export interface ApiProviderInfo {
	providerId: string
	model: ApiHandlerModel
	mode: Mode
	customPrompt?: string // "compact"
	autoCondenseThreshold?: number // 0-1 range
}

export interface SingleCompletionHandler {
	completePrompt(prompt: string): Promise<string>
}

function createHandlerForProvider(
	apiProvider: string | undefined,
	options: Omit<ApiConfiguration, "apiProvider">,
	mode: Mode,
): ApiHandler {
	// Map ask→plan, debug→act for API settings lookup
	const isPlan = getApiSettingsMode(mode) === "plan"
	switch (apiProvider) {
		case "anthropic":
			return new AnthropicHandler({
				onRetryAttempt: options.onRetryAttempt,
				apiKey: options.apiKey,
				anthropicBaseUrl: options.anthropicBaseUrl,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "openrouter":
			return new OpenRouterHandler({
				onRetryAttempt: options.onRetryAttempt,
				openRouterApiKey: options.openRouterApiKey,
				openRouterModelId: isPlan ? options.planModeOpenRouterModelId : options.actModeOpenRouterModelId,
				openRouterModelInfo: isPlan ? options.planModeOpenRouterModelInfo : options.actModeOpenRouterModelInfo,
				openRouterProviderSorting: options.openRouterProviderSorting,
				reasoningEffort: isPlan ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens:
					isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				geminiThinkingLevel: isPlan ? options.geminiPlanModeThinkingLevel : options.geminiActModeThinkingLevel,
			})
		case "openai":
			return new OpenAiHandler({
				onRetryAttempt: options.onRetryAttempt,
				openAiApiKey: options.openAiApiKey,
				openAiBaseUrl: options.openAiBaseUrl,
				azureApiVersion: options.azureApiVersion,
				azureIdentity: options.azureIdentity,
				openAiHeaders: options.openAiHeaders,
				openAiModelId: isPlan ? options.planModeOpenAiModelId : options.actModeOpenAiModelId,
				openAiModelInfo: isPlan ? options.planModeOpenAiModelInfo : options.actModeOpenAiModelInfo,
				reasoningEffort: isPlan ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				thinkingBudgetTokens: isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "ollama":
			return new OllamaHandler({
				onRetryAttempt: options.onRetryAttempt,
				ollamaBaseUrl: options.ollamaBaseUrl,
				ollamaApiKey: options.ollamaApiKey,
				ollamaModelId: isPlan ? options.planModeOllamaModelId : options.actModeOllamaModelId,
				ollamaApiOptionsCtxNum: options.ollamaApiOptionsCtxNum,
				requestTimeoutMs: options.requestTimeoutMs,
			})
		case "lmstudio":
			return new LmStudioHandler({
				onRetryAttempt: options.onRetryAttempt,
				lmStudioBaseUrl: options.lmStudioBaseUrl,
				lmStudioModelId: isPlan ? options.planModeLmStudioModelId : options.actModeLmStudioModelId,
				lmStudioMaxTokens: options.lmStudioMaxTokens,
			})
		case "gemini":
			return new GeminiHandler({
				onRetryAttempt: options.onRetryAttempt,
				geminiApiKey: options.geminiApiKey,
				geminiBaseUrl: options.geminiBaseUrl,
				thinkingBudgetTokens:
					isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				thinkingLevel: isPlan ? options.geminiPlanModeThinkingLevel : options.geminiActModeThinkingLevel,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
				ulid: options.ulid,
			})
		case "openai-native":
			return new OpenAiNativeHandler({
				onRetryAttempt: options.onRetryAttempt,
				openAiNativeApiKey: options.openAiNativeApiKey,
				reasoningEffort: isPlan ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "openai-codex":
			return new OpenAiCodexHandler({
				onRetryAttempt: options.onRetryAttempt,
				reasoningEffort: isPlan ? options.planModeReasoningEffort : options.actModeReasoningEffort,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "deepseek":
			return new DeepSeekHandler({
				onRetryAttempt: options.onRetryAttempt,
				deepSeekApiKey: options.deepSeekApiKey,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "qwen":
			return new QwenHandler({
				onRetryAttempt: options.onRetryAttempt,
				qwenApiKey: options.qwenApiKey,
				qwenApiLine:
					options.qwenApiLine === QwenApiRegions.INTERNATIONAL ? QwenApiRegions.INTERNATIONAL : QwenApiRegions.CHINA,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "qwen-code":
			return new QwenCodeHandler({
				onRetryAttempt: options.onRetryAttempt,
				qwenCodeOauthPath: options.qwenCodeOauthPath,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "qwen-web":
			return new QwenWebHandler({
				onRetryAttempt: options.onRetryAttempt,
				qwenWebToken: options.qwenWebToken,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "vscode-lm":
			return new VsCodeLmHandler({
				onRetryAttempt: options.onRetryAttempt,
				vsCodeLmModelSelector:
					isPlan ? options.planModeVsCodeLmModelSelector : options.actModeVsCodeLmModelSelector,
			})
		case "litellm":
			return new LiteLlmHandler({
				onRetryAttempt: options.onRetryAttempt,
				liteLlmApiKey: options.liteLlmApiKey,
				liteLlmBaseUrl: options.liteLlmBaseUrl,
				liteLlmModelId: isPlan ? options.planModeLiteLlmModelId : options.actModeLiteLlmModelId,
				liteLlmModelInfo: isPlan ? options.planModeLiteLlmModelInfo : options.actModeLiteLlmModelInfo,
				thinkingBudgetTokens:
					isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
				liteLlmUsePromptCache: options.liteLlmUsePromptCache,
				ulid: options.ulid,
			})
		case "claude-code":
			return new ClaudeCodeHandler({
				onRetryAttempt: options.onRetryAttempt,
				claudeCodePath: options.claudeCodePath,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
		case "gigachat":
			return new GigaChatHandler({
				onRetryAttempt: options.onRetryAttempt,
				gigaChatApiKey: options.gigaChatApiKey,
				gigaChatScope: options.gigaChatScope,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
			})
		case "yandexgpt":
			return new YandexGptHandler({
				onRetryAttempt: options.onRetryAttempt,
				yandexGptApiKey: options.yandexGptApiKey,
				yandexGptFolderId: options.yandexGptFolderId,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
			})
		default:
			return new AnthropicHandler({
				onRetryAttempt: options.onRetryAttempt,
				apiKey: options.apiKey,
				anthropicBaseUrl: options.anthropicBaseUrl,
				apiModelId: isPlan ? options.planModeApiModelId : options.actModeApiModelId,
				thinkingBudgetTokens:
					isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens,
			})
	}
}

export function buildApiHandler(configuration: ApiConfiguration, mode: Mode): ApiHandler {
	const { planModeApiProvider, actModeApiProvider, ...options } = configuration
	const isPlan = getApiSettingsMode(mode) === "plan"

	const apiProvider = isPlan ? planModeApiProvider : actModeApiProvider

	// Validate thinking budget tokens against model's maxTokens to prevent API errors
	// wrapped in a try-catch for safety, but this should never throw
	try {
		const thinkingBudgetTokens = isPlan ? options.planModeThinkingBudgetTokens : options.actModeThinkingBudgetTokens
		if (thinkingBudgetTokens && thinkingBudgetTokens > 0) {
			const handler = createHandlerForProvider(apiProvider, options, mode)

			const modelInfo = handler.getModel().info
			if (modelInfo?.maxTokens && modelInfo.maxTokens > 0 && thinkingBudgetTokens > modelInfo.maxTokens) {
				const clippedValue = modelInfo.maxTokens - 1
				if (isPlan) {
					options.planModeThinkingBudgetTokens = clippedValue
				} else {
					options.actModeThinkingBudgetTokens = clippedValue
				}
			} else {
				return handler // don't rebuild unless its necessary
			}
		}
	} catch (error) {
		Logger.error("buildApiHandler error:", error)
	}

	return createHandlerForProvider(apiProvider, options, mode)
}
