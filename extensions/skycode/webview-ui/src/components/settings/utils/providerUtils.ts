import {
	ApiConfiguration,
	ApiProvider,
	anthropicDefaultModelId,
	anthropicModels,
	claudeCodeDefaultModelId,
	claudeCodeModels,
	deepSeekDefaultModelId,
	deepSeekModels,
	gigaChatDefaultModelId,
	gigaChatModels,
	yandexGptDefaultModelId,
	yandexGptModels,
	geminiDefaultModelId,
	geminiModels,
	internationalQwenDefaultModelId,
	internationalQwenModels,
	liteLlmModelInfoSaneDefaults,
	ModelInfo,
	mainlandQwenDefaultModelId,
	mainlandQwenModels,
	openAiCodexDefaultModelId,
	openAiCodexModels,
	openAiModelInfoSaneDefaults,
	openAiNativeDefaultModelId,
	openAiNativeModels,
	openRouterDefaultModelId,
	openRouterDefaultModelInfo,
	qwenCodeDefaultModelId,
	qwenCodeModels,
	qwenWebDefaultModelId,
	qwenWebModels,
} from "@shared/api"
import { Mode } from "@shared/storage/types"

/**
 * Returns the static model list for a provider.
 * For providers with dynamic models (openrouter, skycode, ollama, etc.), returns undefined.
 * Some providers depend on configuration (qwen, zai) for region-specific models.
 */
export function getModelsForProvider(
	provider: ApiProvider,
	apiConfiguration?: ApiConfiguration,
	dynamicModels: { liteLlmModels?: Record<string, ModelInfo>; basetenModels?: Record<string, ModelInfo> } = {},
): Record<string, ModelInfo> | undefined {
	switch (provider) {
		case "anthropic":
			return anthropicModels
		case "claude-code":
			return claudeCodeModels
		case "gemini":
			return geminiModels
		case "openai-native":
			return openAiNativeModels
		case "openai-codex":
			return openAiCodexModels
		case "deepseek":
			return deepSeekModels
		case "gigachat":
			return gigaChatModels
		case "yandexgpt":
			return yandexGptModels
		case "qwen":
			return apiConfiguration?.qwenApiLine === "china" ? mainlandQwenModels : internationalQwenModels
		case "qwen-code":
			return qwenCodeModels
		case "qwen-web":
			return qwenWebModels
		case "litellm":
			return dynamicModels?.liteLlmModels
		// Providers with dynamic models - return undefined
		case "openrouter":
		case "openai":
		case "ollama":
		case "lmstudio":
		case "vscode-lm":
		default:
			return undefined
	}
}

/**
 * Interface for normalized API configuration
 */
export interface NormalizedApiConfig {
	selectedProvider: ApiProvider
	selectedModelId: string
	selectedModelInfo: ModelInfo
}

/**
 * Normalizes API configuration to ensure consistent values
 */
export function normalizeApiConfiguration(
	apiConfiguration: ApiConfiguration | undefined,
	currentMode: Mode,
): NormalizedApiConfig {
	const provider =
		(currentMode === "plan" ? apiConfiguration?.planModeApiProvider : apiConfiguration?.actModeApiProvider) || "openai-native"

	const modelId = currentMode === "plan" ? apiConfiguration?.planModeApiModelId : apiConfiguration?.actModeApiModelId

	const getProviderData = (
		models: Record<string, ModelInfo>,
		defaultId: string,
		options?: { preserveUnknownModelId?: boolean },
	) => {
		let selectedModelId: string
		let selectedModelInfo: ModelInfo
		if (modelId && modelId in models) {
			selectedModelId = modelId
			selectedModelInfo = models[modelId]
		} else if (modelId && options?.preserveUnknownModelId) {
			// Custom / proxy model id not in the built-in catalog — still send to API; use default for UI metadata only
			selectedModelId = modelId
			selectedModelInfo = models[defaultId]
		} else {
			selectedModelId = defaultId
			selectedModelInfo = models[defaultId]
		}
		return {
			selectedProvider: provider,
			selectedModelId,
			selectedModelInfo,
		}
	}

	switch (provider) {
		case "anthropic":
			return getProviderData(anthropicModels, anthropicDefaultModelId, { preserveUnknownModelId: true })
		case "claude-code":
			return getProviderData(claudeCodeModels, claudeCodeDefaultModelId)
		case "gemini":
			return getProviderData(geminiModels, geminiDefaultModelId)
		case "openai-native":
			return getProviderData(openAiNativeModels, openAiNativeDefaultModelId)
		case "openai-codex":
			return getProviderData(openAiCodexModels, openAiCodexDefaultModelId)
		case "deepseek":
			return getProviderData(deepSeekModels, deepSeekDefaultModelId)
		case "gigachat":
			return getProviderData(gigaChatModels, gigaChatDefaultModelId)
		case "yandexgpt":
			return getProviderData(yandexGptModels, yandexGptDefaultModelId)
		case "qwen":
			const qwenModels = apiConfiguration?.qwenApiLine === "china" ? mainlandQwenModels : internationalQwenModels
			const qwenDefaultId =
				apiConfiguration?.qwenApiLine === "china" ? mainlandQwenDefaultModelId : internationalQwenDefaultModelId
			return getProviderData(qwenModels, qwenDefaultId)
		case "qwen-code":
			return getProviderData(qwenCodeModels, qwenCodeDefaultModelId)
		case "qwen-web":
			return getProviderData(qwenWebModels, qwenWebDefaultModelId)
		case "openrouter":
			const openRouterModelId =
				currentMode === "plan" ? apiConfiguration?.planModeOpenRouterModelId : apiConfiguration?.actModeOpenRouterModelId
			const openRouterModelInfo =
				currentMode === "plan"
					? apiConfiguration?.planModeOpenRouterModelInfo
					: apiConfiguration?.actModeOpenRouterModelInfo
			return {
				selectedProvider: provider,
				selectedModelId: openRouterModelId || openRouterDefaultModelId,
				selectedModelInfo: openRouterModelInfo || openRouterDefaultModelInfo,
			}
		case "openai":
			const openAiModelId =
				currentMode === "plan" ? apiConfiguration?.planModeOpenAiModelId : apiConfiguration?.actModeOpenAiModelId
			const openAiModelInfo =
				currentMode === "plan" ? apiConfiguration?.planModeOpenAiModelInfo : apiConfiguration?.actModeOpenAiModelInfo
			return {
				selectedProvider: provider,
				selectedModelId: openAiModelId || "",
				selectedModelInfo: openAiModelInfo || openAiModelInfoSaneDefaults,
			}
		case "ollama":
			const ollamaModelId =
				currentMode === "plan" ? apiConfiguration?.planModeOllamaModelId : apiConfiguration?.actModeOllamaModelId
			return {
				selectedProvider: provider,
				selectedModelId: ollamaModelId || "",
				selectedModelInfo: {
					...openAiModelInfoSaneDefaults,
					contextWindow: Number(apiConfiguration?.ollamaApiOptionsCtxNum ?? 32768),
				},
			}
		case "lmstudio":
			const lmStudioModelId =
				currentMode === "plan" ? apiConfiguration?.planModeLmStudioModelId : apiConfiguration?.actModeLmStudioModelId
			return {
				selectedProvider: provider,
				selectedModelId: lmStudioModelId || "",
				selectedModelInfo: {
					...openAiModelInfoSaneDefaults,
					contextWindow: Number(apiConfiguration?.lmStudioMaxTokens ?? 32768),
				},
			}
		case "vscode-lm":
			const vsCodeLmModelSelector =
				currentMode === "plan"
					? apiConfiguration?.planModeVsCodeLmModelSelector
					: apiConfiguration?.actModeVsCodeLmModelSelector
			return {
				selectedProvider: provider,
				selectedModelId: vsCodeLmModelSelector ? `${vsCodeLmModelSelector.vendor}/${vsCodeLmModelSelector.family}` : "",
				selectedModelInfo: {
					...openAiModelInfoSaneDefaults,
					supportsImages: false, // VSCode LM API currently doesn't support images
				},
			}
		case "litellm": {
			const liteLlmModelId =
				currentMode === "plan" ? apiConfiguration?.planModeLiteLlmModelId : apiConfiguration?.actModeLiteLlmModelId
			const liteLlmModelInfo =
				currentMode === "plan" ? apiConfiguration?.planModeLiteLlmModelInfo : apiConfiguration?.actModeLiteLlmModelInfo
			return {
				selectedProvider: provider,
				selectedModelId: liteLlmModelId || "",
				selectedModelInfo: liteLlmModelInfo || liteLlmModelInfoSaneDefaults,
			}
		}
		default:
			return getProviderData(anthropicModels, anthropicDefaultModelId, { preserveUnknownModelId: true })
	}
}

/**
 * Gets mode-specific field values from API configuration
 * @param apiConfiguration The API configuration object
 * @param mode The current mode ("plan" or "act")
 * @returns Object containing mode-specific field values for clean destructuring
 */
export function getModeSpecificFields(apiConfiguration: ApiConfiguration | undefined, mode: Mode) {
	if (!apiConfiguration) {
		return {
			// Core fields
			apiProvider: undefined,
			apiModelId: undefined,

			// Provider-specific model IDs
			lmStudioModelId: undefined,
			ollamaModelId: undefined,
			liteLlmModelId: undefined,
			openAiModelId: undefined,
			openRouterModelId: undefined,

			// Model info objects
			openAiModelInfo: undefined,
			liteLlmModelInfo: undefined,
			openRouterModelInfo: undefined,
			vsCodeLmModelSelector: undefined,

			// AWS Bedrock fields

			// Huawei Cloud Maas Model Info

			// Other mode-specific fields
			thinkingBudgetTokens: undefined,
			reasoningEffort: undefined,
		}
	}

	return {
		// Core fields
		apiProvider: mode === "plan" ? apiConfiguration.planModeApiProvider : apiConfiguration.actModeApiProvider,
		apiModelId: mode === "plan" ? apiConfiguration.planModeApiModelId : apiConfiguration.actModeApiModelId,

		// Provider-specific model IDs
		lmStudioModelId: mode === "plan" ? apiConfiguration.planModeLmStudioModelId : apiConfiguration.actModeLmStudioModelId,
		ollamaModelId: mode === "plan" ? apiConfiguration.planModeOllamaModelId : apiConfiguration.actModeOllamaModelId,
		liteLlmModelId: mode === "plan" ? apiConfiguration.planModeLiteLlmModelId : apiConfiguration.actModeLiteLlmModelId,
		openAiModelId: mode === "plan" ? apiConfiguration.planModeOpenAiModelId : apiConfiguration.actModeOpenAiModelId,
		openRouterModelId:
			mode === "plan" ? apiConfiguration.planModeOpenRouterModelId : apiConfiguration.actModeOpenRouterModelId,

		// Model info objects
		openAiModelInfo: mode === "plan" ? apiConfiguration.planModeOpenAiModelInfo : apiConfiguration.actModeOpenAiModelInfo,
		liteLlmModelInfo: mode === "plan" ? apiConfiguration.planModeLiteLlmModelInfo : apiConfiguration.actModeLiteLlmModelInfo,
		openRouterModelInfo:
			mode === "plan" ? apiConfiguration.planModeOpenRouterModelInfo : apiConfiguration.actModeOpenRouterModelInfo,
		vsCodeLmModelSelector:
			mode === "plan" ? apiConfiguration.planModeVsCodeLmModelSelector : apiConfiguration.actModeVsCodeLmModelSelector,

		// AWS Bedrock fields

		// Huawei Cloud Maas Model Info

		// Other mode-specific fields
		thinkingBudgetTokens:
			mode === "plan" ? apiConfiguration.planModeThinkingBudgetTokens : apiConfiguration.actModeThinkingBudgetTokens,
		reasoningEffort: mode === "plan" ? apiConfiguration.planModeReasoningEffort : apiConfiguration.actModeReasoningEffort,
		// Oracle Code Assist
	}
}

/**
 * Synchronizes mode configurations by copying the source mode's settings to both modes
 * This is used when the "Use different models for Plan and Act modes" toggle is unchecked
 */
export async function syncModeConfigurations(
	apiConfiguration: ApiConfiguration | undefined,
	sourceMode: Mode,
	handleFieldsChange: (updates: Partial<ApiConfiguration>) => Promise<void>,
): Promise<void> {
	if (!apiConfiguration) {
		return
	}

	const sourceFields = getModeSpecificFields(apiConfiguration, sourceMode)
	const { apiProvider } = sourceFields

	if (!apiProvider) {
		return
	}

	// Build the complete update object with both plan and act mode fields
	const updates: Partial<ApiConfiguration> = {
		// Always sync common fields
		planModeApiProvider: sourceFields.apiProvider,
		actModeApiProvider: sourceFields.apiProvider,
		planModeThinkingBudgetTokens: sourceFields.thinkingBudgetTokens,
		actModeThinkingBudgetTokens: sourceFields.thinkingBudgetTokens,
		planModeReasoningEffort: sourceFields.reasoningEffort,
		actModeReasoningEffort: sourceFields.reasoningEffort,
	}

	// Handle provider-specific fields
	switch (apiProvider) {
		case "openrouter":
			updates.planModeOpenRouterModelId = sourceFields.openRouterModelId
			updates.actModeOpenRouterModelId = sourceFields.openRouterModelId
			updates.planModeOpenRouterModelInfo = sourceFields.openRouterModelInfo
			updates.actModeOpenRouterModelInfo = sourceFields.openRouterModelInfo
			break

		case "openai":
			updates.planModeOpenAiModelId = sourceFields.openAiModelId
			updates.actModeOpenAiModelId = sourceFields.openAiModelId
			updates.planModeOpenAiModelInfo = sourceFields.openAiModelInfo
			updates.actModeOpenAiModelInfo = sourceFields.openAiModelInfo
			break

		case "ollama":
			updates.planModeOllamaModelId = sourceFields.ollamaModelId
			updates.actModeOllamaModelId = sourceFields.ollamaModelId
			break

		case "lmstudio":
			updates.planModeLmStudioModelId = sourceFields.lmStudioModelId
			updates.actModeLmStudioModelId = sourceFields.lmStudioModelId
			break

		case "vscode-lm":
			updates.planModeVsCodeLmModelSelector = sourceFields.vsCodeLmModelSelector
			updates.actModeVsCodeLmModelSelector = sourceFields.vsCodeLmModelSelector
			break

		case "litellm":
			updates.planModeLiteLlmModelId = sourceFields.liteLlmModelId
			updates.actModeLiteLlmModelId = sourceFields.liteLlmModelId
			updates.planModeLiteLlmModelInfo = sourceFields.liteLlmModelInfo
			updates.actModeLiteLlmModelInfo = sourceFields.liteLlmModelInfo
			break

		case "anthropic":
		case "claude-code":
		case "gemini":
		case "openai-native":
		case "openai-codex":
		case "deepseek":
		case "gigachat":
		case "yandexgpt":
		case "qwen":
		default:
			updates.planModeApiModelId = sourceFields.apiModelId
			updates.actModeApiModelId = sourceFields.apiModelId
			break
	}

	// Make the atomic update
	await handleFieldsChange(updates)
}

// Helper to get provider-specific configuration info and empty state guidance
export const getProviderInfo = (
	provider: ApiProvider,
	apiConfiguration: any,
	effectiveMode: "plan" | "act",
): { modelId?: string; baseUrl?: string; helpText: string } => {
	switch (provider) {
		case "lmstudio":
			return {
				modelId:
					effectiveMode === "plan" ? apiConfiguration.planModeLmStudioModelId : apiConfiguration.actModeLmStudioModelId,
				baseUrl: apiConfiguration.lmStudioBaseUrl,
				helpText: "Start LM Studio and load a model to begin",
			}
		case "ollama":
			return {
				modelId:
					effectiveMode === "plan" ? apiConfiguration.planModeOllamaModelId : apiConfiguration.actModeOllamaModelId,
				baseUrl: apiConfiguration.ollamaBaseUrl,
				helpText: "Run `ollama serve` and pull a model",
			}
		case "litellm":
			return {
				modelId:
					effectiveMode === "plan" ? apiConfiguration.planModeLiteLlmModelId : apiConfiguration.actModeLiteLlmModelId,
				baseUrl: apiConfiguration.liteLlmBaseUrl,
				helpText: "Add your LiteLLM proxy URL in settings",
			}
		case "openai":
			return {
				modelId:
					effectiveMode === "plan" ? apiConfiguration.planModeOpenAiModelId : apiConfiguration.actModeOpenAiModelId,
				baseUrl: apiConfiguration.openAiBaseUrl,
				helpText: "Add your OpenAI API key and endpoint",
			}
		case "vscode-lm":
			return {
				modelId: undefined,
				baseUrl: undefined,
				helpText: "Select a VS Code language model from settings",
			}
		default:
			return {
				modelId: undefined,
				baseUrl: undefined,
				helpText: "Configure this provider in model settings",
			}
	}
}
