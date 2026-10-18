import { ApiFormat } from "./proto/skycode/models"
import { ApiHandlerSettings } from "./storage/state-keys"

export type ApiProvider =
	| "anthropic"
	| "claude-code"
	| "openrouter"
	| "openai"
	| "ollama"
	| "lmstudio"
	| "gemini"
	| "openai-native"
	| "openai-codex"
	| "deepseek"
	| "qwen"
	| "qwen-code"
	| "qwen-web"
	| "vscode-lm"
	| "litellm"
	| "gigachat"
	| "yandexgpt"

// [SKYCODE] По умолчанию — OpenAI Compatible (свой шлюз/модель), а не нативный OpenAI
export const DEFAULT_API_PROVIDER = "openai" as ApiProvider

export interface ApiHandlerOptions extends Partial<ApiHandlerSettings> {
	ulid?: string // Used to identify the task in API requests
	onRetryAttempt?: (attempt: number, maxRetries: number, delay: number, error: any) => void // Callback function
}

export type ApiConfiguration = ApiHandlerOptions

// Models

interface PriceTier {
	tokenLimit: number // Upper limit (inclusive) of *input* tokens for this price. Use Infinity for the highest tier.
	price: number // Price per million tokens for this tier.
}

export interface ModelInfo {
	name?: string
	maxTokens?: number
	contextWindow?: number
	supportsImages?: boolean
	supportsPromptCache: boolean // this value is hardcoded for now
	supportsReasoning?: boolean // Whether the model supports reasoning/thinking mode
	inputPrice?: number // Keep for non-tiered input models
	outputPrice?: number // Keep for non-tiered output models
	thinkingConfig?: {
		maxBudget?: number // Max allowed thinking budget tokens
		outputPrice?: number // Output price per million tokens when budget > 0
		outputPriceTiers?: PriceTier[] // Optional: Tiered output price when budget > 0
		geminiThinkingLevel?: "low" | "high" // Optional: preset thinking level
		supportsThinkingLevel?: boolean // Whether the model supports thinking level (low/high)
	}
	supportsGlobalEndpoint?: boolean // Whether the model supports a global endpoint with Vertex AI
	cacheWritesPrice?: number
	cacheReadsPrice?: number
	description?: string
	tiers?: {
		contextWindow: number
		inputPrice?: number
		outputPrice?: number
		cacheWritesPrice?: number
		cacheReadsPrice?: number
	}[]
	temperature?: number
	apiFormat?: ApiFormat // The API format used by this model
}

export interface OpenAiCompatibleModelInfo extends ModelInfo {
	temperature?: number
	isR1FormatRequired?: boolean
	systemRole?: "developer" | "system"
	supportsReasoningEffort?: boolean
	supportsTools?: boolean
	supportsStreaming?: boolean
}

export const CLAUDE_SONNET_1M_SUFFIX = ":1m"
export const CLAUDE_SONNET_1M_TIERS = [
	{
		contextWindow: 200000,
		inputPrice: 3.0,
		outputPrice: 15,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
	},
	{
		contextWindow: Number.MAX_SAFE_INTEGER, // storing infinity in vs storage is not possible, it converts to 'null', which causes crash in webview ModelInfoView
		inputPrice: 6,
		outputPrice: 22.5,
		cacheWritesPrice: 7.5,
		cacheReadsPrice: 0.6,
	},
]

// Anthropic
// https://docs.anthropic.com/en/docs/about-claude/models // prices updated 2025-01-02
export type AnthropicModelId = keyof typeof anthropicModels
export const anthropicDefaultModelId: AnthropicModelId = "claude-opus-4-7"
export const ANTHROPIC_MIN_THINKING_BUDGET = 1_024
export const ANTHROPIC_MAX_THINKING_BUDGET = 6_000
export const anthropicModels = {
	"claude-sonnet-4-5-20250929": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
	},
	"claude-sonnet-4-5-20250929:1m": {
		maxTokens: 8192,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
		tiers: CLAUDE_SONNET_1M_TIERS,
	},
	// Vertex / some OpenAI-compatible proxies use @date instead of Anthropic's -date suffix
	"claude-sonnet-4-5@20250929": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
	},
	"claude-sonnet-4-5@20250929:1m": {
		maxTokens: 8192,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
		tiers: CLAUDE_SONNET_1M_TIERS,
	},
	"claude-haiku-4-5-20251001": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 1,
		outputPrice: 5.0,
		cacheWritesPrice: 1.25,
		cacheReadsPrice: 0.1,
	},
	"claude-sonnet-4-20250514": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
	},
	"claude-sonnet-4-20250514:1m": {
		maxTokens: 8192,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
		tiers: CLAUDE_SONNET_1M_TIERS,
	},
	"claude-opus-4-5-20251101": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 5.0,
		outputPrice: 25.0,
		cacheWritesPrice: 6.25,
		cacheReadsPrice: 0.5,
	},
	// Gateway-style ids (common on third-party proxies)
	"claude-opus-4-7": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 5.0,
		outputPrice: 25.0,
		cacheWritesPrice: 6.25,
		cacheReadsPrice: 0.5,
	},
	"claude-opus-4-7-1m": {
		maxTokens: 8192,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 5.0,
		outputPrice: 25.0,
		cacheWritesPrice: 6.25,
		cacheReadsPrice: 0.5,
		tiers: CLAUDE_SONNET_1M_TIERS,
	},
	"claude-opus-4-1-20250805": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 15.0,
		outputPrice: 75.0,
		cacheWritesPrice: 18.75,
		cacheReadsPrice: 1.5,
	},
	"claude-opus-4-20250514": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 15.0,
		outputPrice: 75.0,
		cacheWritesPrice: 18.75,
		cacheReadsPrice: 1.5,
	},
	"claude-3-7-sonnet-20250219": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,

		supportsPromptCache: true,
		supportsReasoning: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
	},
	"claude-3-5-sonnet-20241022": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,

		supportsPromptCache: true,
		inputPrice: 3.0, // $3 per million input tokens
		outputPrice: 15.0, // $15 per million output tokens
		cacheWritesPrice: 3.75, // $3.75 per million tokens
		cacheReadsPrice: 0.3, // $0.30 per million tokens
	},
	"claude-3-5-haiku-20241022": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.8,
		outputPrice: 4.0,
		cacheWritesPrice: 1.0,
		cacheReadsPrice: 0.08,
	},
	"claude-3-opus-20240229": {
		maxTokens: 4096,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 15.0,
		outputPrice: 75.0,
		cacheWritesPrice: 18.75,
		cacheReadsPrice: 1.5,
	},
	"claude-3-haiku-20240307": {
		maxTokens: 4096,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.25,
		outputPrice: 1.25,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 0.03,
	},
} as const satisfies Record<string, ModelInfo> // as const assertion makes the object deeply readonly

// Claude Code
export type ClaudeCodeModelId = keyof typeof claudeCodeModels
export const claudeCodeDefaultModelId: ClaudeCodeModelId = "claude-opus-4-7"
export const claudeCodeModels = {
	sonnet: {
		...anthropicModels["claude-sonnet-4-5-20250929"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	opus: {
		...anthropicModels["claude-opus-4-1-20250805"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-haiku-4-5-20251001": {
		...anthropicModels["claude-haiku-4-5-20251001"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-sonnet-4-5-20250929": {
		...anthropicModels["claude-sonnet-4-5-20250929"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-sonnet-4-20250514": {
		...anthropicModels["claude-sonnet-4-20250514"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-opus-4-5-20251101": {
		...anthropicModels["claude-opus-4-5-20251101"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-opus-4-7": {
		...anthropicModels["claude-opus-4-7"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-opus-4-7-1m": {
		...anthropicModels["claude-opus-4-7-1m"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-opus-4-1-20250805": {
		...anthropicModels["claude-opus-4-1-20250805"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-opus-4-20250514": {
		...anthropicModels["claude-opus-4-20250514"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-3-7-sonnet-20250219": {
		...anthropicModels["claude-3-7-sonnet-20250219"],
		supportsImages: false,
		supportsPromptCache: false,
	},
	"claude-3-5-haiku-20241022": {
		...anthropicModels["claude-3-5-haiku-20241022"],
		supportsImages: true,
		supportsPromptCache: false,
	},
} as const satisfies Record<string, ModelInfo>

// OpenRouter
// https://openrouter.ai/models?order=newest&supported_parameters=tools
export const openRouterDefaultModelId = "anthropic/claude-sonnet-4.5" // will always exist in openRouterModels
export const openRouterClaudeSonnet41mModelId = `anthropic/claude-sonnet-4${CLAUDE_SONNET_1M_SUFFIX}`
export const openRouterClaudeSonnet451mModelId = `anthropic/claude-sonnet-4.5${CLAUDE_SONNET_1M_SUFFIX}`
export const openRouterDefaultModelInfo: ModelInfo = {
	maxTokens: 8192,
	contextWindow: 200_000,
	supportsImages: true,
	supportsPromptCache: true,
	inputPrice: 3.0,
	outputPrice: 15.0,
	cacheWritesPrice: 3.75,
	cacheReadsPrice: 0.3,
	description:
		"Claude Sonnet 4.5 delivers superior intelligence across coding, agentic search, and AI agent capabilities. It's a powerful choice for agentic coding, and can complete tasks across the entire software development lifecycle—from initial planning to bug fixes, maintenance to large refactors. It offers strong performance in both planning and solving for complex coding tasks, making it an ideal choice to power end-to-end software development processes.\n\nRead more in the [blog post here](https://www.anthropic.com/claude/sonnet)",
}

// Skycode custom model - Devstral
export const skycodeDevstralModelInfo: ModelInfo = {
	contextWindow: 256000,
	supportsImages: false,
	supportsPromptCache: false,
	inputPrice: 0,
	outputPrice: 0,
	cacheReadsPrice: 0,
	cacheWritesPrice: 0,
	description: "A stealth model for agentic coding tasks",
}

export const OPENROUTER_PROVIDER_PREFERENCES: Record<string, { order: string[]; allow_fallbacks: boolean }> = {
	// Exacto Providers
	"moonshotai/kimi-k2:exacto": {
		order: ["groq", "moonshotai"],
		allow_fallbacks: false,
	},
	"z-ai/glm-4.6:exacto": {
		order: ["z-ai", "novita"],
		allow_fallbacks: false,
	},
	"deepseek/deepseek-v3.1-terminus:exacto": {
		order: ["novita", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-coder:exacto": {
		order: ["baseten"],
		allow_fallbacks: false,
	},
	"openai/gpt-oss-120b:exacto": {
		order: ["groq", "novita"],
		allow_fallbacks: false,
	},

	// Normal Providers
	"moonshotai/kimi-k2": {
		order: ["groq", "fireworks", "baseten", "parasail", "novita", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-coder": {
		order: ["nebius", "baseten", "fireworks", "together", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-235b-a22b-thinking-2507": {
		order: ["nebius", "baseten", "fireworks", "together", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-235b-a22b-07-25": {
		order: ["nebius", "baseten", "fireworks", "together", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-30b-a3b-thinking-2507": {
		order: ["nebius", "baseten", "fireworks", "together", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-30b-a3b-instruct-2507": {
		order: ["nebius", "baseten", "fireworks", "together", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-30b-a3b:free": {
		order: ["nebius", "baseten", "fireworks", "together", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-next-80b-a3b-thinking": {
		order: ["nebius", "baseten", "fireworks", "together", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-next-80b-a3b-instruct": {
		order: ["nebius", "baseten", "fireworks", "together", "deepinfra"],
		allow_fallbacks: false,
	},
	"qwen/qwen3-max": {
		order: ["nebius", "baseten", "fireworks", "together", "deepinfra"],
		allow_fallbacks: false,
	},
	"deepseek/deepseek-v3.2-exp": {
		order: ["deepseek", "novita", "fireworks", "nebius"],
		allow_fallbacks: false,
	},
	"z-ai/glm-4.6": {
		order: ["z-ai", "novita", "baseten", "fireworks", "chutes"],
		allow_fallbacks: false,
	},
	"z-ai/glm-4.5v": {
		order: ["z-ai", "novita", "baseten", "fireworks", "chutes"],
		allow_fallbacks: false,
	},
	"z-ai/glm-4.5": {
		order: ["z-ai", "novita", "baseten", "fireworks", "chutes"],
		allow_fallbacks: false,
	},
	"z-ai/glm-4.5-air": {
		order: ["z-ai", "novita", "baseten", "fireworks", "chutes"],
		allow_fallbacks: false,
	},
}

export const openAiModelInfoSaneDefaults: OpenAiCompatibleModelInfo = {
	maxTokens: -1,
	contextWindow: 128_000,
	supportsImages: true,
	supportsPromptCache: false,
	isR1FormatRequired: false,
	inputPrice: 0,
	outputPrice: 0,
	temperature: 0,
}

// Gemini
// https://ai.google.dev/gemini-api/docs/models/gemini
export type GeminiModelId = keyof typeof geminiModels
export const geminiDefaultModelId: GeminiModelId = "gemini-3-pro-preview"
export const geminiModels = {
	"gemini-3-pro-preview": {
		maxTokens: 65536,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 4.0,
		outputPrice: 18.0,
		cacheReadsPrice: 0.4,
		thinkingConfig: {
			// If you don't specify a thinking level, Gemini will use the model's default
			// dynamic thinking level, "high", for Gemini 3 Pro Preview.
			geminiThinkingLevel: "high",
			supportsThinkingLevel: true,
		},
		tiers: [
			{
				contextWindow: 200000,
				inputPrice: 2.0,
				outputPrice: 12.0,
				cacheReadsPrice: 0.2,
			},
			{
				contextWindow: Infinity,
				inputPrice: 4.0,
				outputPrice: 18.0,
				cacheReadsPrice: 0.4,
			},
		],
	},
	"gemini-3-flash-preview": {
		maxTokens: 65536,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true,
		supportsGlobalEndpoint: true,
		inputPrice: 0.5,
		outputPrice: 3.0,
		cacheWritesPrice: 0.05,
		supportsReasoning: true,
		thinkingConfig: {
			geminiThinkingLevel: "low",
			supportsThinkingLevel: true,
		},
		tiers: [
			{
				contextWindow: 200000,
				inputPrice: 0.3,
				outputPrice: 2.5,
				cacheReadsPrice: 0.03,
			},
			{
				contextWindow: Infinity,
				inputPrice: 0.3,
				outputPrice: 2.5,
				cacheReadsPrice: 0.03,
			},
		],
	},
	"gemini-2.5-pro": {
		maxTokens: 65536,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 2.5,
		outputPrice: 15,
		cacheReadsPrice: 0.625,
		thinkingConfig: {
			maxBudget: 32767,
		},
		tiers: [
			{
				contextWindow: 200000,
				inputPrice: 1.25,
				outputPrice: 10,
				cacheReadsPrice: 0.31,
			},
			{
				contextWindow: Infinity,
				inputPrice: 2.5,
				outputPrice: 15,
				cacheReadsPrice: 0.625,
			},
		],
	},
	"gemini-2.5-flash-lite-preview-06-17": {
		maxTokens: 64000,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsGlobalEndpoint: true,
		inputPrice: 0.1,
		outputPrice: 0.4,
		cacheReadsPrice: 0.025,
		description: "Preview version - may not be available in all regions",
		thinkingConfig: {
			maxBudget: 24576,
		},
	},
	"gemini-2.5-flash": {
		maxTokens: 65536,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.3,
		outputPrice: 2.5,
		cacheReadsPrice: 0.075,
		thinkingConfig: {
			maxBudget: 24576,
			outputPrice: 3.5,
		},
	},
	"gemini-2.0-flash-001": {
		maxTokens: 8192,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.1,
		outputPrice: 0.4,
		cacheReadsPrice: 0.025,
		cacheWritesPrice: 1.0,
	},
	"gemini-2.0-flash-lite-preview-02-05": {
		maxTokens: 8192,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"gemini-2.0-pro-exp-02-05": {
		maxTokens: 8192,
		contextWindow: 2_097_152,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"gemini-2.0-flash-thinking-exp-01-21": {
		maxTokens: 65_536,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"gemini-2.0-flash-thinking-exp-1219": {
		maxTokens: 8192,
		contextWindow: 32_767,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"gemini-2.0-flash-exp": {
		maxTokens: 8192,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"gemini-1.5-flash-002": {
		maxTokens: 8192,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.15, // Default price (highest tier)
		outputPrice: 0.6, // Default price (highest tier)
		cacheReadsPrice: 0.0375,
		cacheWritesPrice: 1.0,
		tiers: [
			{
				contextWindow: 128000,
				inputPrice: 0.075,
				outputPrice: 0.3,
				cacheReadsPrice: 0.01875,
			},
			{
				contextWindow: Infinity,
				inputPrice: 0.15,
				outputPrice: 0.6,
				cacheReadsPrice: 0.0375,
			},
		],
	},
	"gemini-1.5-flash-exp-0827": {
		maxTokens: 8192,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"gemini-1.5-flash-8b-exp-0827": {
		maxTokens: 8192,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"gemini-1.5-pro-002": {
		maxTokens: 8192,
		contextWindow: 2_097_152,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"gemini-1.5-pro-exp-0827": {
		maxTokens: 8192,
		contextWindow: 2_097_152,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"gemini-exp-1206": {
		maxTokens: 8192,
		contextWindow: 2_097_152,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
} as const satisfies Record<string, ModelInfo>

// OpenAI Native
// https://openai.com/api/pricing/
export type OpenAiNativeModelId = keyof typeof openAiNativeModels
export const openAiNativeDefaultModelId: OpenAiNativeModelId = "gpt-5.2"
export const openAiNativeModels = {
	"gpt-5.2": {
		maxTokens: 8_192,
		contextWindow: 272000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.75,
		outputPrice: 14.0,
		cacheReadsPrice: 0.175,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5.2-codex": {
		maxTokens: 8_192, // 128000 breaks context window truncation
		contextWindow: 400000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.75,
		outputPrice: 14.0,
		cacheReadsPrice: 0.175,
		apiFormat: ApiFormat.OPENAI_RESPONSES,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5.1-2025-11-13": {
		maxTokens: 8_192,
		contextWindow: 272000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.25,
		outputPrice: 10.0,
		cacheReadsPrice: 0.125,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5.1": {
		maxTokens: 8_192, // 128000 breaks context window truncation
		contextWindow: 272000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.25,
		outputPrice: 10.0,
		cacheReadsPrice: 0.125,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5.1-codex": {
		maxTokens: 8_192, // 128000 breaks context window truncation
		contextWindow: 400000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.25,
		outputPrice: 10.0,
		cacheReadsPrice: 0.125,
		apiFormat: ApiFormat.OPENAI_RESPONSES,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5.1-chat-latest": {
		maxTokens: 8_192,
		contextWindow: 400000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.25,
		outputPrice: 10,
		cacheReadsPrice: 0.125,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5-2025-08-07": {
		maxTokens: 8_192, // 128000 breaks context window truncation
		contextWindow: 272000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.25,
		outputPrice: 10.0,
		cacheReadsPrice: 0.125,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5-codex": {
		maxTokens: 8_192, // 128000 breaks context window truncation
		contextWindow: 400000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.25,
		outputPrice: 10.0,
		cacheReadsPrice: 0.125,
		apiFormat: ApiFormat.OPENAI_RESPONSES,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5-mini-2025-08-07": {
		maxTokens: 8_192,
		contextWindow: 272000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.25,
		outputPrice: 2.0,
		cacheReadsPrice: 0.025,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5-nano-2025-08-07": {
		maxTokens: 8_192,
		contextWindow: 272000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.05,
		outputPrice: 0.4,
		cacheReadsPrice: 0.005,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	"gpt-5-chat-latest": {
		maxTokens: 8_192,
		contextWindow: 400000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.25,
		outputPrice: 10,
		cacheReadsPrice: 0.125,
		temperature: 1,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
	},
	o3: {
		maxTokens: 100_000,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 2.0,
		outputPrice: 8.0,
		cacheReadsPrice: 0.5,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
		supportsTools: false,
	},
	"o4-mini": {
		maxTokens: 100_000,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.1,
		outputPrice: 4.4,
		cacheReadsPrice: 0.275,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
		supportsTools: false,
	},
	"gpt-4.1": {
		maxTokens: 32_768,
		contextWindow: 1_047_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 2,
		outputPrice: 8,
		cacheReadsPrice: 0.5,
		temperature: 0,
	},
	"gpt-4.1-mini": {
		maxTokens: 32_768,
		contextWindow: 1_047_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.4,
		outputPrice: 1.6,
		cacheReadsPrice: 0.1,
		temperature: 0,
	},
	"gpt-4.1-nano": {
		maxTokens: 32_768,
		contextWindow: 1_047_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.1,
		outputPrice: 0.4,
		cacheReadsPrice: 0.025,
		temperature: 0,
	},
	"o3-mini": {
		maxTokens: 100_000,
		contextWindow: 200_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 1.1,
		outputPrice: 4.4,
		cacheReadsPrice: 0.55,
		systemRole: "developer",
		supportsReasoning: true,
		supportsReasoningEffort: true,
		supportsTools: false,
	},
	// don't support tool use yet
	o1: {
		maxTokens: 100_000,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 15,
		outputPrice: 60,
		cacheReadsPrice: 7.5,
		supportsStreaming: false,
	},
	"o1-preview": {
		maxTokens: 32_768,
		contextWindow: 128_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 15,
		outputPrice: 60,
		cacheReadsPrice: 7.5,
		supportsStreaming: false,
	},
	"o1-mini": {
		maxTokens: 65_536,
		contextWindow: 128_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 1.1,
		outputPrice: 4.4,
		cacheReadsPrice: 0.55,
		supportsStreaming: false,
	},
	"gpt-4o": {
		maxTokens: 4_096,
		contextWindow: 128_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 2.5,
		outputPrice: 10,
		cacheReadsPrice: 1.25,
		temperature: 0,
	},
	"gpt-4o-mini": {
		maxTokens: 16_384,
		contextWindow: 128_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.15,
		outputPrice: 0.6,
		cacheReadsPrice: 0.075,
		temperature: 0,
	},
	"chatgpt-4o-latest": {
		maxTokens: 16_384,
		contextWindow: 128_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 5,
		outputPrice: 15,
		temperature: 0,
	},
} as const satisfies Record<string, OpenAiCompatibleModelInfo>

// OpenAI Codex (ChatGPT Plus/Pro subscription)
// Uses OAuth authentication via ChatGPT, routes to chatgpt.com/backend-api/codex/responses
// Subscription-based pricing (all costs are $0)
export type OpenAiCodexModelId = keyof typeof openAiCodexModels
export const openAiCodexDefaultModelId: OpenAiCodexModelId = "gpt-5.2-codex"
export const openAiCodexModels = {
	"gpt-5.2-codex": {
		maxTokens: 128_000,
		contextWindow: 400_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		apiFormat: ApiFormat.OPENAI_RESPONSES,
		// Subscription-based: no per-token costs
		inputPrice: 0,
		outputPrice: 0,
		description: "GPT-5.2 Codex: OpenAI's flagship coding model via ChatGPT subscription",
	},
	"gpt-5.1-codex-max": {
		maxTokens: 128_000,
		contextWindow: 400_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		apiFormat: ApiFormat.OPENAI_RESPONSES,
		inputPrice: 0,
		outputPrice: 0,
		description: "GPT-5.1 Codex Max: Maximum capability coding model via ChatGPT subscription",
	},
	"gpt-5.1-codex-mini": {
		maxTokens: 128_000,
		contextWindow: 400_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		apiFormat: ApiFormat.OPENAI_RESPONSES,
		inputPrice: 0,
		outputPrice: 0,
		description: "GPT-5.1 Codex Mini: Faster version for coding tasks via ChatGPT subscription",
	},
	"gpt-5.2": {
		maxTokens: 128_000,
		contextWindow: 400_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoning: true,
		apiFormat: ApiFormat.OPENAI_RESPONSES,
		inputPrice: 0,
		outputPrice: 0,
		description: "GPT-5.2: Latest GPT model via ChatGPT subscription",
	},
} as const satisfies Record<string, ModelInfo>

// Azure OpenAI
// https://learn.microsoft.com/en-us/azure/ai-services/openai/api-version-deprecation
// https://learn.microsoft.com/en-us/azure/ai-services/openai/reference#api-specs
export const azureOpenAiDefaultApiVersion = "2024-08-01-preview"

// DeepSeek
// https://api-docs.deepseek.com/quick_start/pricing
export type DeepSeekModelId = keyof typeof deepSeekModels
export const deepSeekDefaultModelId: DeepSeekModelId = "deepseek-chat"
export const deepSeekModels = {
	"deepseek-chat": {
		maxTokens: 8_000,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true, // supports context caching, but not in the way anthropic does it (deepseek reports input tokens and reads/writes in the same usage report) FIXME: we need to show users cache stats how deepseek does it
		inputPrice: 0, // technically there is no input price, it's all either a cache hit or miss (ApiOptions will not show this). Input is the sum of cache reads and writes
		outputPrice: 1.1,
		cacheWritesPrice: 0.27,
		cacheReadsPrice: 0.07,
	},
	"deepseek-reasoner": {
		maxTokens: 8_000,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true, // supports context caching, but not in the way anthropic does it (deepseek reports input tokens and reads/writes in the same usage report) FIXME: we need to show users cache stats how deepseek does it
		inputPrice: 0, // technically there is no input price, it's all either a cache hit or miss (ApiOptions will not show this)
		outputPrice: 2.19,
		cacheWritesPrice: 0.55,
		cacheReadsPrice: 0.14,
	},
} as const satisfies Record<string, ModelInfo>

// GigaChat (Sber)
// https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api
// GigaChat 2 models — all have 128K context, function calling support
// Prices per 1M tokens (RUB): Lite 65₽, Pro 500₽, Max 650₽
export type GigaChatModelId = keyof typeof gigaChatModels
export const gigaChatDefaultModelId: GigaChatModelId = "GigaChat-2-Pro"
export const gigaChatModels = {
	// API model IDs: https://developers.sber.ru/docs/files/gigachat/gigachat-api-primer.md
	// All GigaChat 2 models support native function calling (functions + function_call params)
	// GigaChat-2 Lite removed: can't reliably call functions with correct arguments
	"GigaChat-2-Pro": {
		maxTokens: 8_192,
		contextWindow: 128_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.5, // 500₽ per 1M tokens
		outputPrice: 0.5,
		description: "GigaChat 2 Pro — сложные инструкции, суммаризация, вопросы и ответы",
	},
	"GigaChat-2-Max": {
		maxTokens: 8_192,
		contextWindow: 128_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.65, // 650₽ per 1M tokens
		outputPrice: 0.65,
		description: "GigaChat 2 Max — лучшее качество, длинный контекст, многошаговые диалоги",
	},
} as const satisfies Record<string, ModelInfo>

// GigaChat scope options
export type GigaChatScope = "GIGACHAT_API_PERS" | "GIGACHAT_API_CORP" | "GIGACHAT_API_B2B"

// YandexGPT (Yandex Cloud)
// OpenAI-compatible API: https://yandex.cloud/ru/docs/ai-studio/concepts/openai-compatibility
// Endpoint: https://llm.api.cloud.yandex.net/v1/chat/completions
// Auth: Authorization: Bearer <API-key>, x-folder-id: <folder_id>
// Models: gpt://<folder_id>/<model>/latest
// Pricing: https://yandex.cloud/ru/docs/foundation-models/pricing
export type YandexGptModelId = keyof typeof yandexGptModels
export const yandexGptDefaultModelId: YandexGptModelId = "yandexgpt"
export const yandexGptModels = {
	yandexgpt: {
		maxTokens: 8_192,
		contextWindow: 32_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.2, // 200₽ per 1M tokens (6₽ per 1000 tokens for YandexGPT 5 Pro)
		outputPrice: 0.4, // 400₽ per 1M tokens (12₽ per 1000 tokens for YandexGPT 5 Pro)
		description: "YandexGPT 5 Pro — основная модель, сложные задачи, генерация и анализ",
	},
	"yandexgpt-lite": {
		maxTokens: 8_192,
		contextWindow: 32_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.02, // 20₽ per 1M tokens (0.6₽ per 1000 tokens for YandexGPT 5 Lite)
		outputPrice: 0.04, // 40₽ per 1M tokens (1.2₽ per 1000 tokens for YandexGPT 5 Lite)
		description: "YandexGPT 5 Lite — быстрая и доступная, для рутинных задач",
	},
} as const satisfies Record<string, ModelInfo>

// Qwen
// https://bailian.console.aliyun.com/
// The first model in the list is used as the default model for each region
export const internationalQwenModels = {
	"qwen3-coder-plus": {
		maxTokens: 65_536,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1,
		outputPrice: 5,
	},
	"qwen3-coder-480b-a35b-instruct": {
		maxTokens: 65_536,
		contextWindow: 204_800,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.5,
		outputPrice: 7.5,
	},
	"qwen3-235b-a22b": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2,
		outputPrice: 8,
		cacheWritesPrice: 2,
		cacheReadsPrice: 8,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 20,
		},
	},
	"qwen3-32b": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2,
		outputPrice: 8,
		cacheWritesPrice: 2,
		cacheReadsPrice: 8,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 20,
		},
	},
	"qwen3-30b-a3b": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.75,
		outputPrice: 3,
		cacheWritesPrice: 0.75,
		cacheReadsPrice: 3,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 7.5,
		},
	},
	"qwen3-14b": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1,
		outputPrice: 4,
		cacheWritesPrice: 1,
		cacheReadsPrice: 4,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 10,
		},
	},
	"qwen3-8b": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 2,
		cacheWritesPrice: 0.5,
		cacheReadsPrice: 2,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 5,
		},
	},
	"qwen3-4b": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 1.2,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 1.2,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 3,
		},
	},
	"qwen3-1.7b": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 1.2,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 1.2,
		thinkingConfig: {
			maxBudget: 30_720,
			outputPrice: 3,
		},
	},
	"qwen3-0.6b": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 1.2,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 1.2,
		thinkingConfig: {
			maxBudget: 30_720,
			outputPrice: 3,
		},
	},
	"qwen2.5-coder-32b-instruct": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
		cacheWritesPrice: 0.002,
		cacheReadsPrice: 0.006,
	},
	"qwen2.5-coder-14b-instruct": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
		cacheWritesPrice: 0.002,
		cacheReadsPrice: 0.006,
	},
	"qwen2.5-coder-7b-instruct": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.001,
		outputPrice: 0.002,
		cacheWritesPrice: 0.001,
		cacheReadsPrice: 0.002,
	},
	"qwen2.5-coder-3b-instruct": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen2.5-coder-1.5b-instruct": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen2.5-coder-0.5b-instruct": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen-coder-plus-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.5,
		outputPrice: 7,
		cacheWritesPrice: 3.5,
		cacheReadsPrice: 7,
	},
	"qwen-plus-latest": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.8,
		outputPrice: 2,
		cacheWritesPrice: 0.8,
		cacheReadsPrice: 2,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 16,
		},
	},
	"qwen-turbo-latest": {
		maxTokens: 16_384,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.6,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 0.6,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 6,
		},
	},
	"qwen-max-latest": {
		maxTokens: 30_720,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.4,
		outputPrice: 9.6,
		cacheWritesPrice: 2.4,
		cacheReadsPrice: 9.6,
	},
	"qwen-coder-plus": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.5,
		outputPrice: 7,
		cacheWritesPrice: 3.5,
		cacheReadsPrice: 7,
	},
	"qwen-plus": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.8,
		outputPrice: 2,
		cacheWritesPrice: 0.8,
		cacheReadsPrice: 0.2,
	},
	"qwen-turbo": {
		maxTokens: 1_000_000,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.6,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 0.6,
	},
	"qwen-max": {
		maxTokens: 30_720,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.4,
		outputPrice: 9.6,
		cacheWritesPrice: 2.4,
		cacheReadsPrice: 9.6,
	},
	"deepseek-v3": {
		maxTokens: 8_000,
		contextWindow: 64_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.28,
		cacheWritesPrice: 0.14,
		cacheReadsPrice: 0.014,
	},
	"deepseek-r1": {
		maxTokens: 8_000,
		contextWindow: 64_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 2.19,
		cacheWritesPrice: 0.55,
		cacheReadsPrice: 0.14,
	},
	"qwen-vl-max": {
		maxTokens: 30_720,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 3,
		outputPrice: 9,
		cacheWritesPrice: 3,
		cacheReadsPrice: 9,
	},
	"qwen-vl-max-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 3,
		outputPrice: 9,
		cacheWritesPrice: 3,
		cacheReadsPrice: 9,
	},
	"qwen-vl-plus": {
		maxTokens: 6_000,
		contextWindow: 8_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 1.5,
		outputPrice: 4.5,
		cacheWritesPrice: 1.5,
		cacheReadsPrice: 4.5,
	},
	"qwen-vl-plus-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 1.5,
		outputPrice: 4.5,
		cacheWritesPrice: 1.5,
		cacheReadsPrice: 4.5,
	},
} as const satisfies Record<string, ModelInfo>

export const mainlandQwenModels = {
	"qwen3-235b-a22b": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2,
		outputPrice: 8,
		cacheWritesPrice: 2,
		cacheReadsPrice: 8,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 20,
		},
	},
	"qwen3-32b": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2,
		outputPrice: 8,
		cacheWritesPrice: 2,
		cacheReadsPrice: 8,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 20,
		},
	},
	"qwen3-30b-a3b": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.75,
		outputPrice: 3,
		cacheWritesPrice: 0.75,
		cacheReadsPrice: 3,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 7.5,
		},
	},
	"qwen3-14b": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1,
		outputPrice: 4,
		cacheWritesPrice: 1,
		cacheReadsPrice: 4,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 10,
		},
	},
	"qwen3-8b": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 2,
		cacheWritesPrice: 0.5,
		cacheReadsPrice: 2,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 5,
		},
	},
	"qwen3-4b": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 1.2,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 1.2,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 3,
		},
	},
	"qwen3-1.7b": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 1.2,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 1.2,
		thinkingConfig: {
			maxBudget: 30_720,
			outputPrice: 3,
		},
	},
	"qwen3-0.6b": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 1.2,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 1.2,
		thinkingConfig: {
			maxBudget: 30_720,
			outputPrice: 3,
		},
	},
	"qwen2.5-coder-32b-instruct": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
		cacheWritesPrice: 0.002,
		cacheReadsPrice: 0.006,
	},
	"qwen2.5-coder-14b-instruct": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.002,
		outputPrice: 0.006,
		cacheWritesPrice: 0.002,
		cacheReadsPrice: 0.006,
	},
	"qwen2.5-coder-7b-instruct": {
		maxTokens: 8_192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.001,
		outputPrice: 0.002,
		cacheWritesPrice: 0.001,
		cacheReadsPrice: 0.002,
	},
	"qwen2.5-coder-3b-instruct": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen2.5-coder-1.5b-instruct": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen2.5-coder-0.5b-instruct": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen-coder-plus-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.5,
		outputPrice: 7,
		cacheWritesPrice: 3.5,
		cacheReadsPrice: 7,
	},
	"qwen-plus-latest": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.8,
		outputPrice: 2,
		cacheWritesPrice: 0.8,
		cacheReadsPrice: 2,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 16,
		},
	},
	"qwen-turbo-latest": {
		maxTokens: 16_384,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.6,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 0.6,
		thinkingConfig: {
			maxBudget: 38_912,
			outputPrice: 6,
		},
	},
	"qwen-max-latest": {
		maxTokens: 30_720,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.4,
		outputPrice: 9.6,
		cacheWritesPrice: 2.4,
		cacheReadsPrice: 9.6,
	},
	"qwq-plus-latest": {
		maxTokens: 8_192,
		contextWindow: 131_071,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwq-plus": {
		maxTokens: 8_192,
		contextWindow: 131_071,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
	},
	"qwen-coder-plus": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.5,
		outputPrice: 7,
		cacheWritesPrice: 3.5,
		cacheReadsPrice: 7,
	},
	"qwen-plus": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.8,
		outputPrice: 2,
		cacheWritesPrice: 0.8,
		cacheReadsPrice: 0.2,
	},
	"qwen-turbo": {
		maxTokens: 1_000_000,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.6,
		cacheWritesPrice: 0.3,
		cacheReadsPrice: 0.6,
	},
	"qwen-max": {
		maxTokens: 30_720,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.4,
		outputPrice: 9.6,
		cacheWritesPrice: 2.4,
		cacheReadsPrice: 9.6,
	},
	"deepseek-v3": {
		maxTokens: 8_000,
		contextWindow: 64_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 0.28,
		cacheWritesPrice: 0.14,
		cacheReadsPrice: 0.014,
	},
	"deepseek-r1": {
		maxTokens: 8_000,
		contextWindow: 64_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0,
		outputPrice: 2.19,
		cacheWritesPrice: 0.55,
		cacheReadsPrice: 0.14,
	},
	"qwen-vl-max": {
		maxTokens: 30_720,
		contextWindow: 32_768,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 3,
		outputPrice: 9,
		cacheWritesPrice: 3,
		cacheReadsPrice: 9,
	},
	"qwen-vl-max-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 3,
		outputPrice: 9,
		cacheWritesPrice: 3,
		cacheReadsPrice: 9,
	},
	"qwen-vl-plus": {
		maxTokens: 6_000,
		contextWindow: 8_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 1.5,
		outputPrice: 4.5,
		cacheWritesPrice: 1.5,
		cacheReadsPrice: 4.5,
	},
	"qwen-vl-plus-latest": {
		maxTokens: 129_024,
		contextWindow: 131_072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 1.5,
		outputPrice: 4.5,
		cacheWritesPrice: 1.5,
		cacheReadsPrice: 4.5,
	},
} as const satisfies Record<string, ModelInfo>
export enum QwenApiRegions {
	CHINA = "china",
	INTERNATIONAL = "international",
}
export type MainlandQwenModelId = keyof typeof mainlandQwenModels
export type InternationalQwenModelId = keyof typeof internationalQwenModels
// Set first model in the list as the default model for each region
export const internationalQwenDefaultModelId: InternationalQwenModelId = Object.keys(
	internationalQwenModels,
)[0] as InternationalQwenModelId
export const mainlandQwenDefaultModelId: MainlandQwenModelId = Object.keys(mainlandQwenModels)[0] as MainlandQwenModelId

// LiteLLM
// https://docs.litellm.ai/docs/
export type LiteLLMModelId = string
export const liteLlmDefaultModelId = "anthropic/claude-3-7-sonnet-20250219"
export interface LiteLLMModelInfo extends ModelInfo {
	temperature?: number
}

export const liteLlmModelInfoSaneDefaults: LiteLLMModelInfo = {
	maxTokens: -1,
	contextWindow: 128_000,
	supportsImages: true,
	supportsPromptCache: true,
	inputPrice: 0,
	outputPrice: 0,
	cacheWritesPrice: 0,
	cacheReadsPrice: 0,
	temperature: 0,
}

// Qwen Code
// https://chat.qwen.ai/
export const qwenCodeModels = {
	"qwen3-coder-plus": {
		maxTokens: 65_536,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		cacheWritesPrice: 0,
		cacheReadsPrice: 0,
		description: "Qwen3 Coder Plus - High-performance coding model with 1M context window for large codebases",
	},
	"qwen3-coder-flash": {
		maxTokens: 65_536,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		cacheWritesPrice: 0,
		cacheReadsPrice: 0,
		description: "Qwen3 Coder Flash - Fast coding model with 1M context window optimized for speed",
	},
} as const satisfies Record<string, ModelInfo>
export type QwenCodeModelId = keyof typeof qwenCodeModels
export const qwenCodeDefaultModelId: QwenCodeModelId = "qwen3-coder-plus"

// Qwen Web (chat.qwen.ai) — free via browser session token.
// Not an official API. Token is extracted from localStorage on chat.qwen.ai.
// Rate limits and session expiration apply. Prices set to 0 since it's free.
export const qwenWebModels = {
	"qwen3-max": {
		maxTokens: 32_768,
		contextWindow: 262_144,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		description: "Qwen3 Max via chat.qwen.ai (free, web session).",
	},
	"qwen3-coder-plus": {
		maxTokens: 65_536,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		description: "Qwen3 Coder Plus via chat.qwen.ai (free, web session).",
	},
	"qwen3-vl-plus": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		description: "Qwen3 VL Plus via chat.qwen.ai (free, web session).",
	},
	"qwen3-235b-a22b": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		description: "Qwen3 235B-A22B via chat.qwen.ai (free, web session).",
	},
	"qwen-max-latest": {
		maxTokens: 8_192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		description: "Qwen Max Latest via chat.qwen.ai (free, web session).",
	},
	"qwq-32b": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		description: "QwQ-32B (reasoning) via chat.qwen.ai (free, web session).",
	},
} as const satisfies Record<string, ModelInfo>
export type QwenWebModelId = keyof typeof qwenWebModels
export const qwenWebDefaultModelId: QwenWebModelId = "qwen3-max"
