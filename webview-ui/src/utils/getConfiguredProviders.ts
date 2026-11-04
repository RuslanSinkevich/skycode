import { ApiConfiguration, ApiProvider } from "@shared/api"
import PROVIDERS from "@shared/providers/providers.json"

/**
 * Returns a list of API providers that are configured (have required credentials/settings)
 * Based on validation logic from validate.ts
 */
export function getConfiguredProviders(apiConfiguration: ApiConfiguration | undefined): ApiProvider[] {
	const configured: ApiProvider[] = []

	if (!apiConfiguration) {
		return ["openrouter"]
	}

	// Anthropic - requires API key
	if (apiConfiguration.apiKey) {
		configured.push("anthropic")
	}

	// OpenRouter - requires API key
	if (apiConfiguration.openRouterApiKey) {
		configured.push("openrouter")
	}

	// Gemini - requires API key
	if (apiConfiguration.geminiApiKey) {
		configured.push("gemini")
	}

	// OpenAI Native - requires API key
	if (apiConfiguration.openAiNativeApiKey) {
		configured.push("openai-native")
	}

	// DeepSeek - requires API key
	if (apiConfiguration.deepSeekApiKey) {
		configured.push("deepseek")
	}

	// GigaChat (Sber) - requires Authorization Key
	if (apiConfiguration.gigaChatApiKey) {
		configured.push("gigachat")
	}

	// YandexGPT - requires API key and folder ID
	if (apiConfiguration.yandexGptApiKey) {
		configured.push("yandexgpt")
	}

	// Qwen - requires API key
	if (apiConfiguration.qwenApiKey) {
		configured.push("qwen")
	}

	// OpenAI Compatible - requires base URL and API key, OR has model configured
	if (
		(apiConfiguration.openAiBaseUrl && apiConfiguration.openAiApiKey) ||
		apiConfiguration.planModeOpenAiModelId ||
		apiConfiguration.actModeOpenAiModelId
	) {
		configured.push("openai")
	}

	// Ollama - local provider, check base URL OR model configured
	if (apiConfiguration.ollamaBaseUrl || apiConfiguration.planModeOllamaModelId || apiConfiguration.actModeOllamaModelId) {
		configured.push("ollama")
	}

	// LM Studio - local provider, check base URL OR model configured
	if (apiConfiguration.lmStudioBaseUrl || apiConfiguration.planModeLmStudioModelId || apiConfiguration.actModeLmStudioModelId) {
		configured.push("lmstudio")
	}

	// LiteLLM - check base URL, API key OR model configured
	if (
		apiConfiguration.liteLlmBaseUrl ||
		apiConfiguration.liteLlmApiKey ||
		apiConfiguration.planModeLiteLlmModelId ||
		apiConfiguration.actModeLiteLlmModelId
	) {
		configured.push("litellm")
	}

	// VSCode LM - always potentially available
	configured.push("vscode-lm")

	// Claude Code - requires path
	if (apiConfiguration.claudeCodePath) {
		configured.push("claude-code")
	}

	// Qwen Code - requires API key (same as Qwen)
	if (apiConfiguration.qwenApiKey) {
		configured.push("qwen-code")
	}

	// Qwen Web - requires browser session token
	if (apiConfiguration.qwenWebToken) {
		configured.push("qwen-web")
	}

	return configured
}

/**
 * Get provider display label from provider value
 * Uses the canonical providers.json as source of truth
 */
export function getProviderLabel(provider: ApiProvider): string {
	const providerEntry = PROVIDERS.list.find((p) => p.value === provider)
	return providerEntry?.label || provider
}
