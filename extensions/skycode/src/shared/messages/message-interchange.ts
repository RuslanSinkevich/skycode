import type { Anthropic } from "@anthropic-ai/sdk"

/** Client-built `tool_use` blocks must set `caller` (Anthropic SDK 0.92+). */
export const DIRECT_TOOL_USE_CALLER = { type: "direct" as const }

/** Full `Anthropic.Usage` for interchange `Message.usage`; unknown SDK fields are null. */
export function sdkMessageUsage(partial: {
	input_tokens: number
	output_tokens: number
	cache_creation_input_tokens?: number | null
	cache_read_input_tokens?: number | null
}): Anthropic.Usage {
	return {
		input_tokens: partial.input_tokens,
		output_tokens: partial.output_tokens,
		cache_creation_input_tokens: partial.cache_creation_input_tokens ?? null,
		cache_read_input_tokens: partial.cache_read_input_tokens ?? null,
		cache_creation: null,
		inference_geo: null,
		server_tool_use: null,
		service_tier: null,
	}
}

export function isBase64ImageSource(
	source: Anthropic.Base64ImageSource | Anthropic.URLImageSource,
): source is Anthropic.Base64ImageSource {
	return source.type === "base64"
}
