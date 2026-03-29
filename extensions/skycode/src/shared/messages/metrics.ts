import { Mode } from "../storage/types"

export interface SkycodeMessageModelInfo {
	modelId: string
	providerId: string
	mode: Mode
}

interface SkycodeTokensInfo {
	prompt: number // Total input tokens (includes cached + non-cached)
	completion: number // Total output tokens
	cached: number // Subset of prompt_tokens that were cache hits
}

export interface SkycodeMessageMetricsInfo {
	tokens?: SkycodeTokensInfo
	cost?: number // Monetary cost for this turn
}
