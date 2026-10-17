import { ApiHandler } from "@core/api"
import { OpenAiHandler } from "@core/api/providers/openai"
import { getModelCapabilityTier, getSessionLimitsForModel } from "@utils/model-utils"

/**
 * Gets context window information for the given API handler.
 * For weak/medium models, applies a stricter usage ratio so context compaction triggers earlier.
 */
export function getContextWindowInfo(api: ApiHandler) {
	let contextWindow = api.getModel().info.contextWindow || 128_000

	// Handle special cases like DeepSeek
	if (api instanceof OpenAiHandler && api.getModel().id.toLowerCase().includes("deepseek")) {
		contextWindow = 128_000
	}

	const modelId = api.getModel().id
	const tier = getModelCapabilityTier(modelId)
	const sessionLimits = getSessionLimitsForModel(modelId)

	let maxAllowedSize: number

	if (tier !== "strong") {
		// Weak/medium models: use the tier-specific ratio for earlier compaction
		maxAllowedSize = Math.floor(contextWindow * sessionLimits.contextWindowUsageRatio)
	} else {
		switch (contextWindow) {
			case 64_000:
				maxAllowedSize = contextWindow - 27_000
				break
			case 128_000:
				maxAllowedSize = contextWindow - 30_000
				break
			case 200_000:
				maxAllowedSize = contextWindow - 40_000
				break
			default:
				maxAllowedSize = Math.max(contextWindow - 40_000, contextWindow * 0.8)
		}
	}

	return { contextWindow, maxAllowedSize }
}

/**
 * [SKYCODE] Порог автосжатия в токенах — единый для решения о сжатии и для показа в интерфейсе.
 * thresholdPercentage — настройка autoCondenseThreshold (0–1), если задана; не выше maxAllowedSize.
 */
export function getAutoCompactThresholdTokens(api: ApiHandler, thresholdPercentage?: number): number {
	const { contextWindow, maxAllowedSize } = getContextWindowInfo(api)
	const roundedThreshold = thresholdPercentage ? Math.floor(contextWindow * thresholdPercentage) : maxAllowedSize
	return Math.min(roundedThreshold, maxAllowedSize)
}

/**
 * [SKYCODE] Окно контекста и порог автосжатия для кольца контекста в интерфейсе.
 * Числа те же, что использует решение о сжатии (getAutoCompactThresholdTokens).
 */
export function getContextUsageLimits(
	api: ApiHandler,
	thresholdPercentage?: number,
): { contextWindow: number; autoCompactThresholdTokens: number } {
	return {
		contextWindow: getContextWindowInfo(api).contextWindow,
		autoCompactThresholdTokens: getAutoCompactThresholdTokens(api, thresholdPercentage),
	}
}
