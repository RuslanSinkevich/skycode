export enum ModelFamily {
	CLAUDE = "claude",
	GPT = "gpt",
	GPT_5 = "gpt-5",
	NATIVE_GPT_5 = "gpt-5-native", // Uses native tool calling
	NATIVE_GPT_5_1 = "gpt-5-1-native", // Uses native tool calling
	GEMINI = "gemini",
	GEMINI_3 = "gemini3", // Uses native tool calling
	QWEN = "qwen",
	GLM = "glm",
	HERMES = "hermes",
	DEVSTRAL = "devstral",
	NEXT_GEN = "next-gen",
	GENERIC = "generic",
	XS = "xs",
	NATIVE_NEXT_GEN = "native-next-gen", // Uses native tool calling
}

export type ModelCapabilityTier = "strong" | "medium" | "weak"

export interface WeakModelSessionLimits {
	maxToolCallsPerTurn: number
	maxConsecutiveReadOnlyTools: number
	forceCompactAfterSteps: number
	contextWindowUsageRatio: number
}

export const MODEL_SESSION_LIMITS: Record<ModelCapabilityTier, WeakModelSessionLimits> = {
	strong: {
		maxToolCallsPerTurn: Infinity,
		maxConsecutiveReadOnlyTools: Infinity,
		forceCompactAfterSteps: Infinity,
		contextWindowUsageRatio: 0.8,
	},
	// Medium tier — capable cloud models (Qwen, GLM, Hermes, Devstral, non-quantized
	// local). The previous limits were too strict: a strong model on a complex task
	// can easily blow through 40 tool calls in a single turn (lots of file reads +
	// edits + commands), then the SESSION BUDGET EXHAUSTED guard force-completes
	// the turn before the model is done. Doubled the budget; if a model is genuinely
	// looping, the read-only-streak guard (12) catches it before runaway.
	medium: {
		maxToolCallsPerTurn: 80,
		maxConsecutiveReadOnlyTools: 12,
		forceCompactAfterSteps: 40,
		contextWindowUsageRatio: 0.7,
	},
	weak: {
		maxToolCallsPerTurn: 25,
		maxConsecutiveReadOnlyTools: 6,
		forceCompactAfterSteps: 15,
		contextWindowUsageRatio: 0.5,
	},
}
