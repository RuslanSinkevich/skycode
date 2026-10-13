import {
	LiteLLMModelInfo,
	OpenAiCompatibleModelInfo,
	OpenRouterModelInfo,
	ModelsApiConfiguration as ProtoApiConfiguration,
	ApiProvider as ProtoApiProvider,
	ThinkingConfig,
} from "@shared/proto/skycode/models"
import {
	ApiConfiguration,
	ApiProvider,
	LiteLLMModelInfo as AppLiteLLMModelInfo,
	OpenAiCompatibleModelInfo as AppOpenAiCompatibleModelInfo,
	ModelInfo,
} from "../../api"

// Convert application ThinkingConfig to proto ThinkingConfig
function convertThinkingConfigToProto(config: ModelInfo["thinkingConfig"]): ThinkingConfig | undefined {
	if (!config) {
		return undefined
	}

	return {
		maxBudget: config.maxBudget,
		outputPrice: config.outputPrice,
		outputPriceTiers: config.outputPriceTiers || [], // Provide empty array if undefined
	}
}

// Convert proto ThinkingConfig to application ThinkingConfig
function convertProtoToThinkingConfig(config: ThinkingConfig | undefined): ModelInfo["thinkingConfig"] | undefined {
	if (!config) {
		return undefined
	}

	return {
		maxBudget: config.maxBudget,
		outputPrice: config.outputPrice,
		outputPriceTiers: config.outputPriceTiers.length > 0 ? config.outputPriceTiers : undefined,
	}
}

// Convert application ModelInfo to proto OpenRouterModelInfo
function convertModelInfoToProtoOpenRouter(info: ModelInfo | undefined): OpenRouterModelInfo | undefined {
	if (!info) {
		return undefined
	}

	return {
		maxTokens: info.maxTokens,
		contextWindow: info.contextWindow,
		supportsImages: info.supportsImages,
		supportsPromptCache: info.supportsPromptCache ?? false,
		inputPrice: info.inputPrice,
		outputPrice: info.outputPrice,
		cacheWritesPrice: info.cacheWritesPrice,
		cacheReadsPrice: info.cacheReadsPrice,
		description: info.description,
		thinkingConfig: convertThinkingConfigToProto(info.thinkingConfig),
		supportsGlobalEndpoint: info.supportsGlobalEndpoint,
		tiers: info.tiers || [],
	}
}

// Convert proto OpenRouterModelInfo to application ModelInfo
function convertProtoToModelInfo(info: OpenRouterModelInfo | undefined): ModelInfo | undefined {
	if (!info) {
		return undefined
	}

	return {
		maxTokens: info.maxTokens,
		contextWindow: info.contextWindow,
		supportsImages: info.supportsImages,
		supportsPromptCache: info.supportsPromptCache,
		inputPrice: info.inputPrice,
		outputPrice: info.outputPrice,
		cacheWritesPrice: info.cacheWritesPrice,
		cacheReadsPrice: info.cacheReadsPrice,
		description: info.description,
		thinkingConfig: convertProtoToThinkingConfig(info.thinkingConfig),
		supportsGlobalEndpoint: info.supportsGlobalEndpoint,
		tiers: info.tiers.length > 0 ? info.tiers : undefined,
	}
}

// Convert application LiteLLMModelInfo to proto LiteLLMModelInfo
function convertLiteLLMModelInfoToProto(info: AppLiteLLMModelInfo | undefined): LiteLLMModelInfo | undefined {
	if (!info) {
		return undefined
	}

	return {
		maxTokens: info.maxTokens,
		contextWindow: info.contextWindow,
		supportsImages: info.supportsImages,
		supportsPromptCache: info.supportsPromptCache ?? false,
		inputPrice: info.inputPrice,
		outputPrice: info.outputPrice,
		thinkingConfig: convertThinkingConfigToProto(info.thinkingConfig),
		supportsGlobalEndpoint: info.supportsGlobalEndpoint,
		cacheWritesPrice: info.cacheWritesPrice,
		cacheReadsPrice: info.cacheReadsPrice,
		description: info.description,
		tiers: info.tiers || [],
		temperature: info.temperature,
	}
}

// Convert proto LiteLLMModelInfo to application LiteLLMModelInfo
function convertProtoToLiteLLMModelInfo(info: LiteLLMModelInfo | undefined): AppLiteLLMModelInfo | undefined {
	if (!info) {
		return undefined
	}

	return {
		maxTokens: info.maxTokens,
		contextWindow: info.contextWindow,
		supportsImages: info.supportsImages,
		supportsPromptCache: info.supportsPromptCache,
		inputPrice: info.inputPrice,
		outputPrice: info.outputPrice,
		thinkingConfig: convertProtoToThinkingConfig(info.thinkingConfig),
		supportsGlobalEndpoint: info.supportsGlobalEndpoint,
		cacheWritesPrice: info.cacheWritesPrice,
		cacheReadsPrice: info.cacheReadsPrice,
		description: info.description,
		tiers: info.tiers.length > 0 ? info.tiers : undefined,
		temperature: info.temperature,
	}
}

// Convert application OpenAiCompatibleModelInfo to proto OpenAiCompatibleModelInfo
function convertOpenAiCompatibleModelInfoToProto(
	info: AppOpenAiCompatibleModelInfo | undefined,
): OpenAiCompatibleModelInfo | undefined {
	if (!info) {
		return undefined
	}

	return {
		maxTokens: info.maxTokens,
		contextWindow: info.contextWindow,
		supportsImages: info.supportsImages,
		supportsPromptCache: info.supportsPromptCache ?? false,
		inputPrice: info.inputPrice,
		outputPrice: info.outputPrice,
		thinkingConfig: convertThinkingConfigToProto(info.thinkingConfig),
		supportsGlobalEndpoint: info.supportsGlobalEndpoint,
		cacheWritesPrice: info.cacheWritesPrice,
		cacheReadsPrice: info.cacheReadsPrice,
		description: info.description,
		tiers: info.tiers || [],
		temperature: info.temperature,
		isR1FormatRequired: info.isR1FormatRequired,
	}
}

// Convert proto OpenAiCompatibleModelInfo to application OpenAiCompatibleModelInfo
function convertProtoToOpenAiCompatibleModelInfo(
	info: OpenAiCompatibleModelInfo | undefined,
): AppOpenAiCompatibleModelInfo | undefined {
	if (!info) {
		return undefined
	}

	return {
		maxTokens: info.maxTokens,
		contextWindow: info.contextWindow,
		supportsImages: info.supportsImages,
		supportsPromptCache: info.supportsPromptCache,
		inputPrice: info.inputPrice,
		outputPrice: info.outputPrice,
		thinkingConfig: convertProtoToThinkingConfig(info.thinkingConfig),
		supportsGlobalEndpoint: info.supportsGlobalEndpoint,
		cacheWritesPrice: info.cacheWritesPrice,
		cacheReadsPrice: info.cacheReadsPrice,
		description: info.description,
		tiers: info.tiers.length > 0 ? info.tiers : undefined,
		temperature: info.temperature,
		isR1FormatRequired: info.isR1FormatRequired,
	}
}

// Convert application ApiProvider to proto ApiProvider
function convertApiProviderToProto(provider: string | undefined): ProtoApiProvider {
	switch (provider) {
		case "anthropic":
			return ProtoApiProvider.ANTHROPIC
		case "openrouter":
			return ProtoApiProvider.OPENROUTER
		case "openai":
			return ProtoApiProvider.OPENAI
		case "ollama":
			return ProtoApiProvider.OLLAMA
		case "lmstudio":
			return ProtoApiProvider.LMSTUDIO
		case "gemini":
			return ProtoApiProvider.GEMINI
		case "openai-native":
			return ProtoApiProvider.OPENAI_NATIVE
		case "deepseek":
			return ProtoApiProvider.DEEPSEEK
		case "qwen":
			return ProtoApiProvider.QWEN
		case "qwen-code":
			return ProtoApiProvider.QWEN_CODE
		case "qwen-web":
			return ProtoApiProvider.QWEN_WEB
		case "vscode-lm":
			return ProtoApiProvider.VSCODE_LM
		case "litellm":
			return ProtoApiProvider.LITELLM
		case "claude-code":
			return ProtoApiProvider.CLAUDE_CODE
		case "openai-codex":
			return ProtoApiProvider.OPENAI_CODEX
		case "gigachat":
			return ProtoApiProvider.GIGACHAT
		case "yandexgpt":
			return ProtoApiProvider.YANDEXGPT
		default:
			return ProtoApiProvider.OPENAI_NATIVE
	}
}

// Convert proto ApiProvider to application ApiProvider
export function convertProtoToApiProvider(provider: ProtoApiProvider): ApiProvider {
	switch (provider) {
		case ProtoApiProvider.ANTHROPIC:
			return "anthropic"
		case ProtoApiProvider.OPENROUTER:
			return "openrouter"
		case ProtoApiProvider.OPENAI:
			return "openai"
		case ProtoApiProvider.OLLAMA:
			return "ollama"
		case ProtoApiProvider.LMSTUDIO:
			return "lmstudio"
		case ProtoApiProvider.GEMINI:
			return "gemini"
		case ProtoApiProvider.OPENAI_NATIVE:
			return "openai-native"
		case ProtoApiProvider.DEEPSEEK:
			return "deepseek"
		case ProtoApiProvider.QWEN:
			return "qwen"
		case ProtoApiProvider.QWEN_CODE:
			return "qwen-code"
		case ProtoApiProvider.QWEN_WEB:
			return "qwen-web"
		case ProtoApiProvider.VSCODE_LM:
			return "vscode-lm"
		case ProtoApiProvider.LITELLM:
			return "litellm"
		case ProtoApiProvider.CLAUDE_CODE:
			return "claude-code"
		case ProtoApiProvider.OPENAI_CODEX:
			return "openai-codex"
		case ProtoApiProvider.GIGACHAT:
			return "gigachat"
		case ProtoApiProvider.YANDEXGPT:
			return "yandexgpt"
		default:
			return "openai-native"
	}
}

// Converts application ApiConfiguration to proto ApiConfiguration
export function convertApiConfigurationToProto(config: ApiConfiguration): ProtoApiConfiguration {
	return {
		// Global configuration fields
		apiKey: config.apiKey,
		ulid: config.ulid,
		liteLlmBaseUrl: config.liteLlmBaseUrl,
		liteLlmApiKey: config.liteLlmApiKey,
		liteLlmUsePromptCache: config.liteLlmUsePromptCache,
		openAiHeaders: config.openAiHeaders || {},
		anthropicBaseUrl: config.anthropicBaseUrl,
		openRouterApiKey: config.openRouterApiKey,
		openRouterProviderSorting: config.openRouterProviderSorting,
		claudeCodePath: config.claudeCodePath,
		openAiBaseUrl: config.openAiBaseUrl,
		openAiApiKey: config.openAiApiKey,
		ollamaBaseUrl: config.ollamaBaseUrl,
		ollamaApiKey: config.ollamaApiKey,
		ollamaApiOptionsCtxNum: config.ollamaApiOptionsCtxNum,
		lmStudioBaseUrl: config.lmStudioBaseUrl,
		lmStudioMaxTokens: config.lmStudioMaxTokens,
		geminiApiKey: config.geminiApiKey,
		geminiBaseUrl: config.geminiBaseUrl,
		openAiNativeApiKey: config.openAiNativeApiKey,
		deepSeekApiKey: config.deepSeekApiKey,
		gigaChatApiKey: config.gigaChatApiKey,
		gigaChatScope: config.gigaChatScope,
		yandexGptApiKey: config.yandexGptApiKey,
		yandexGptFolderId: config.yandexGptFolderId,
		qwenApiKey: config.qwenApiKey,
		qwenCodeOauthPath: config.qwenCodeOauthPath,
		qwenWebToken: config.qwenWebToken,
		azureApiVersion: config.azureApiVersion,
		azureIdentity: config.azureIdentity,
		qwenApiLine: config.qwenApiLine,
		requestTimeoutMs: config.requestTimeoutMs,

		// Plan mode configurations
		planModeApiProvider: config.planModeApiProvider ? convertApiProviderToProto(config.planModeApiProvider) : undefined,
		planModeApiModelId: config.planModeApiModelId,
		planModeThinkingBudgetTokens: config.planModeThinkingBudgetTokens,
		geminiPlanModeThinkingLevel: config.geminiPlanModeThinkingLevel,
		planModeReasoningEffort: config.planModeReasoningEffort,
		planModeVsCodeLmModelSelector: config.planModeVsCodeLmModelSelector,
		planModeOpenRouterModelId: config.planModeOpenRouterModelId,
		planModeOpenRouterModelInfo: convertModelInfoToProtoOpenRouter(config.planModeOpenRouterModelInfo),
		planModeOpenAiModelId: config.planModeOpenAiModelId,
		planModeOpenAiModelInfo: convertOpenAiCompatibleModelInfoToProto(config.planModeOpenAiModelInfo),
		planModeOllamaModelId: config.planModeOllamaModelId,
		planModeLmStudioModelId: config.planModeLmStudioModelId,
		planModeLiteLlmModelId: config.planModeLiteLlmModelId,
		planModeLiteLlmModelInfo: convertLiteLLMModelInfoToProto(config.planModeLiteLlmModelInfo),

		// Act mode configurations
		actModeApiProvider: config.actModeApiProvider ? convertApiProviderToProto(config.actModeApiProvider) : undefined,
		actModeApiModelId: config.actModeApiModelId,
		actModeThinkingBudgetTokens: config.actModeThinkingBudgetTokens,
		geminiActModeThinkingLevel: config.geminiActModeThinkingLevel,
		actModeReasoningEffort: config.actModeReasoningEffort,
		actModeVsCodeLmModelSelector: config.actModeVsCodeLmModelSelector,
		actModeOpenRouterModelId: config.actModeOpenRouterModelId,
		actModeOpenRouterModelInfo: convertModelInfoToProtoOpenRouter(config.actModeOpenRouterModelInfo),
		actModeOpenAiModelId: config.actModeOpenAiModelId,
		actModeOpenAiModelInfo: convertOpenAiCompatibleModelInfoToProto(config.actModeOpenAiModelInfo),
		actModeOllamaModelId: config.actModeOllamaModelId,
		actModeLmStudioModelId: config.actModeLmStudioModelId,
		actModeLiteLlmModelId: config.actModeLiteLlmModelId,
		actModeLiteLlmModelInfo: convertLiteLLMModelInfoToProto(config.actModeLiteLlmModelInfo),
	}
}

// Converts proto ApiConfiguration to application ApiConfiguration
export function convertProtoToApiConfiguration(protoConfig: ProtoApiConfiguration): ApiConfiguration {
	return {
		// Global configuration fields
		apiKey: protoConfig.apiKey,
		ulid: protoConfig.ulid,
		liteLlmBaseUrl: protoConfig.liteLlmBaseUrl,
		liteLlmApiKey: protoConfig.liteLlmApiKey,
		liteLlmUsePromptCache: protoConfig.liteLlmUsePromptCache,
		openAiHeaders: Object.keys(protoConfig.openAiHeaders || {}).length > 0 ? protoConfig.openAiHeaders : undefined,
		anthropicBaseUrl: protoConfig.anthropicBaseUrl,
		openRouterApiKey: protoConfig.openRouterApiKey,
		openRouterProviderSorting: protoConfig.openRouterProviderSorting,
		claudeCodePath: protoConfig.claudeCodePath,
		openAiBaseUrl: protoConfig.openAiBaseUrl,
		openAiApiKey: protoConfig.openAiApiKey,
		ollamaBaseUrl: protoConfig.ollamaBaseUrl,
		ollamaApiKey: protoConfig.ollamaApiKey,
		ollamaApiOptionsCtxNum: protoConfig.ollamaApiOptionsCtxNum,
		lmStudioBaseUrl: protoConfig.lmStudioBaseUrl,
		lmStudioMaxTokens: protoConfig.lmStudioMaxTokens,
		geminiApiKey: protoConfig.geminiApiKey,
		geminiBaseUrl: protoConfig.geminiBaseUrl,
		openAiNativeApiKey: protoConfig.openAiNativeApiKey,
		deepSeekApiKey: protoConfig.deepSeekApiKey,
		gigaChatApiKey: protoConfig.gigaChatApiKey,
		gigaChatScope: protoConfig.gigaChatScope,
		yandexGptApiKey: protoConfig.yandexGptApiKey,
		yandexGptFolderId: protoConfig.yandexGptFolderId,
		qwenApiKey: protoConfig.qwenApiKey,
		qwenCodeOauthPath: protoConfig.qwenCodeOauthPath,
		qwenWebToken: protoConfig.qwenWebToken,
		azureApiVersion: protoConfig.azureApiVersion,
		azureIdentity: protoConfig.azureIdentity,
		qwenApiLine: protoConfig.qwenApiLine,
		requestTimeoutMs: protoConfig.requestTimeoutMs,

		// Plan mode configurations
		planModeApiProvider:
			protoConfig.planModeApiProvider !== undefined
				? convertProtoToApiProvider(protoConfig.planModeApiProvider)
				: undefined,
		planModeApiModelId: protoConfig.planModeApiModelId,
		planModeThinkingBudgetTokens: protoConfig.planModeThinkingBudgetTokens,
		geminiPlanModeThinkingLevel: protoConfig.geminiPlanModeThinkingLevel,
		planModeReasoningEffort: protoConfig.planModeReasoningEffort,
		planModeVsCodeLmModelSelector: protoConfig.planModeVsCodeLmModelSelector,
		planModeOpenRouterModelId: protoConfig.planModeOpenRouterModelId,
		planModeOpenRouterModelInfo: convertProtoToModelInfo(protoConfig.planModeOpenRouterModelInfo),
		planModeOpenAiModelId: protoConfig.planModeOpenAiModelId,
		planModeOpenAiModelInfo: convertProtoToOpenAiCompatibleModelInfo(protoConfig.planModeOpenAiModelInfo),
		planModeOllamaModelId: protoConfig.planModeOllamaModelId,
		planModeLmStudioModelId: protoConfig.planModeLmStudioModelId,
		planModeLiteLlmModelId: protoConfig.planModeLiteLlmModelId,
		planModeLiteLlmModelInfo: convertProtoToLiteLLMModelInfo(protoConfig.planModeLiteLlmModelInfo),

		// Act mode configurations
		actModeApiProvider:
			protoConfig.actModeApiProvider !== undefined ? convertProtoToApiProvider(protoConfig.actModeApiProvider) : undefined,
		actModeApiModelId: protoConfig.actModeApiModelId,
		actModeThinkingBudgetTokens: protoConfig.actModeThinkingBudgetTokens,
		geminiActModeThinkingLevel: protoConfig.geminiActModeThinkingLevel,
		actModeReasoningEffort: protoConfig.actModeReasoningEffort,
		actModeVsCodeLmModelSelector: protoConfig.actModeVsCodeLmModelSelector,
		actModeOpenRouterModelId: protoConfig.actModeOpenRouterModelId,
		actModeOpenRouterModelInfo: convertProtoToModelInfo(protoConfig.actModeOpenRouterModelInfo),
		actModeOpenAiModelId: protoConfig.actModeOpenAiModelId,
		actModeOpenAiModelInfo: convertProtoToOpenAiCompatibleModelInfo(protoConfig.actModeOpenAiModelInfo),
		actModeOllamaModelId: protoConfig.actModeOllamaModelId,
		actModeLmStudioModelId: protoConfig.actModeLmStudioModelId,
		actModeLiteLlmModelId: protoConfig.actModeLiteLlmModelId,
		actModeLiteLlmModelInfo: convertProtoToLiteLLMModelInfo(protoConfig.actModeLiteLlmModelInfo),
	}
}
