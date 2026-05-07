import { ApiConfiguration, ApiProvider, DEFAULT_API_PROVIDER } from "./api"

/**
 * Reason the auto-selector picked a provider.
 *  - "auth"    — user is signed in to Skycode account
 *  - "api-key" — provider has a non-empty API key in current configuration
 *  - "local"   — provider works without keys (Ollama / LM Studio); only chosen as last resort
 *  - "default" — nothing detected; fall back to {@link DEFAULT_API_PROVIDER}
 */
export type AutoProviderReason = "auth" | "api-key" | "local" | "default"

export interface AutoProviderResult {
	provider: ApiProvider
	reason: AutoProviderReason
	/** Human-readable provider label for UI ("Anthropic", "OpenAI", ...). */
	label: string
}

interface ProviderProbe {
	provider: ApiProvider
	label: string
	/** Returns true if the configuration looks usable for that provider. */
	matches: (cfg: Partial<ApiConfiguration>) => boolean
	reason: AutoProviderReason
}

const isFilled = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0

/**
 * Priority order is intentional. First match wins.
 * Cloud accounts and direct keys outrank generic gateways and local runtimes.
 */
const PROBES: ProviderProbe[] = [
	{
		provider: "skycode",
		label: "Skycode",
		reason: "auth",
		matches: (cfg) => isFilled((cfg as any).skycodeAccountId) || isFilled((cfg as any)["skycode:skycodeAccountId"]),
	},
	{
		provider: "anthropic",
		label: "Anthropic",
		reason: "api-key",
		matches: (cfg) => isFilled(cfg.apiKey),
	},
	{
		provider: "openai-native",
		label: "OpenAI",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).openAiNativeApiKey),
	},
	{
		provider: "gemini",
		label: "Gemini",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).geminiApiKey),
	},
	{
		provider: "openrouter",
		label: "OpenRouter",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).openRouterApiKey),
	},
	{
		provider: "gigachat",
		label: "GigaChat",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).gigaChatApiKey),
	},
	{
		provider: "yandexgpt",
		label: "YandexGPT",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).yandexGptApiKey),
	},
	{
		provider: "deepseek",
		label: "DeepSeek",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).deepSeekApiKey),
	},
	{
		provider: "qwen",
		label: "Qwen",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).qwenApiKey),
	},
	{
		provider: "mistral",
		label: "Mistral",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).mistralApiKey),
	},
	{
		provider: "groq",
		label: "Groq",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).groqApiKey),
	},
	{
		provider: "xai",
		label: "xAI",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).xaiApiKey),
	},
	{
		provider: "moonshot",
		label: "Moonshot",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).moonshotApiKey),
	},
	{
		provider: "cerebras",
		label: "Cerebras",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).cerebrasApiKey),
	},
	{
		provider: "openai",
		label: "OpenAI Compatible",
		reason: "api-key",
		matches: (cfg) => isFilled((cfg as any).openAiApiKey) && isFilled((cfg as any).openAiBaseUrl),
	},
	{
		provider: "ollama",
		label: "Ollama (local)",
		reason: "local",
		matches: (cfg) => isFilled((cfg as any).ollamaBaseUrl),
	},
	{
		provider: "lmstudio",
		label: "LM Studio (local)",
		reason: "local",
		matches: (cfg) => isFilled((cfg as any).lmStudioBaseUrl),
	},
]

/**
 * Pick a provider based on what the user already has configured.
 * Returns the first matching probe in priority order. If nothing matches,
 * falls back to {@link DEFAULT_API_PROVIDER} with reason "default".
 *
 * The result is purely advisory — the caller can override at any time.
 */
export function pickAutoProvider(cfg: Partial<ApiConfiguration> | undefined | null): AutoProviderResult {
	const safe = cfg ?? {}
	for (const probe of PROBES) {
		if (probe.matches(safe)) {
			return { provider: probe.provider, reason: probe.reason, label: probe.label }
		}
	}
	return { provider: DEFAULT_API_PROVIDER, reason: "default", label: "OpenAI" }
}

/**
 * Used by UI to render a static list of provider candidates, even those without a key,
 * so the user can switch manually.
 */
export const ALL_AUTO_PROVIDER_LABELS: Array<{ provider: ApiProvider; label: string }> = PROBES.map(({ provider, label }) => ({
	provider,
	label,
}))
