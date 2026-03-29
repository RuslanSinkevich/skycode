import { Anthropic } from "@anthropic-ai/sdk"
import { SkycodeMessageMetricsInfo, SkycodeMessageModelInfo } from "./metrics"

export type SkycodePromptInputContent = string

export type SkycodeMessageRole = "user" | "assistant"

export interface SkycodeReasoningDetailParam {
	type: "reasoning.text" | string
	text: string
	signature: string
	format: "anthropic-claude-v1" | string
	index: number
}

interface SkycodeSharedMessageParam {
	// The id of the response that the block belongs to
	call_id?: string
}

export const REASONING_DETAILS_PROVIDERS = ["skycode", "openrouter"]

/**
 * An extension of Anthropic.MessageParam that includes Skycode-specific fields: reasoning_details.
 * This ensures backward compatibility where the messages were stored in Anthropic format with additional
 * fields unknown to Anthropic SDK.
 */
export interface SkycodeTextContentBlock extends Anthropic.TextBlockParam, SkycodeSharedMessageParam {
	// reasoning_details only exists for providers listed in REASONING_DETAILS_PROVIDERS
	reasoning_details?: SkycodeReasoningDetailParam[]
	// Thought Signature associates with Gemini
	signature?: string
}

export interface SkycodeImageContentBlock extends Anthropic.ImageBlockParam, SkycodeSharedMessageParam {}

export interface SkycodeDocumentContentBlock extends Anthropic.DocumentBlockParam, SkycodeSharedMessageParam {}

export interface SkycodeUserToolResultContentBlock extends Anthropic.ToolResultBlockParam, SkycodeSharedMessageParam {}

/**
 * Assistant only content types
 */
export interface SkycodeAssistantToolUseBlock extends Anthropic.ToolUseBlockParam, SkycodeSharedMessageParam {
	// reasoning_details only exists for providers listed in REASONING_DETAILS_PROVIDERS
	reasoning_details?: unknown[] | SkycodeReasoningDetailParam[]
	// Thought Signature associates with Gemini
	signature?: string
}

export interface SkycodeAssistantThinkingBlock extends Anthropic.ThinkingBlock, SkycodeSharedMessageParam {
	// The summary items returned by OpenAI response API
	// The reasoning details that will be moved to the text block when finalized
	summary?: unknown[] | SkycodeReasoningDetailParam[]
}

export interface SkycodeAssistantRedactedThinkingBlock extends Anthropic.RedactedThinkingBlockParam, SkycodeSharedMessageParam {}

export type SkycodeToolResponseContent = SkycodePromptInputContent | Array<SkycodeTextContentBlock | SkycodeImageContentBlock>

export type SkycodeUserContent =
	| SkycodeTextContentBlock
	| SkycodeImageContentBlock
	| SkycodeDocumentContentBlock
	| SkycodeUserToolResultContentBlock

export type SkycodeAssistantContent =
	| SkycodeTextContentBlock
	| SkycodeImageContentBlock
	| SkycodeDocumentContentBlock
	| SkycodeAssistantToolUseBlock
	| SkycodeAssistantThinkingBlock
	| SkycodeAssistantRedactedThinkingBlock

export type SkycodeContent = SkycodeUserContent | SkycodeAssistantContent

/**
 * An extension of Anthropic.MessageParam that includes Skycode-specific fields.
 * This ensures backward compatibility where the messages were stored in Anthropic format,
 * while allowing for additional metadata specific to Skycode to avoid unknown fields in Anthropic SDK
 * added by ignoring the type checking for those fields.
 */
export interface SkycodeStorageMessage extends Anthropic.MessageParam {
	/**
	 * Response ID associated with this message
	 */
	id?: string
	role: SkycodeMessageRole
	content: SkycodePromptInputContent | SkycodeContent[]
	/**
	 * NOTE: model information used when generating this message.
	 * Internal use for message conversion only.
	 * MUST be removed before sending message to any LLM provider.
	 */
	modelInfo?: SkycodeMessageModelInfo
	/**
	 * LLM operational and performance metrics for this message
	 * Includes token counts, costs.
	 */
	metrics?: SkycodeMessageMetricsInfo
}

/**
 * Converts SkycodeStorageMessage to Anthropic.MessageParam by removing Skycode-specific fields
 * Skycode-specific fields (like modelInfo, reasoning_details) are properly omitted.
 */
export function convertSkycodeStorageToAnthropicMessage(
	skycodeMessage: SkycodeStorageMessage,
	provider = "anthropic",
): Anthropic.MessageParam {
	const { role, content } = skycodeMessage

	// Handle string content - fast path
	if (typeof content === "string") {
		return { role, content }
	}

	// Removes thinking block that has no signature (invalid thinking block that's incompatible with Anthropic API)
	const filteredContent = content.filter((b) => b.type !== "thinking" || !!b.signature)

	// Handle array content - strip Skycode-specific fields for non-reasoning_details providers
	const shouldCleanContent = !REASONING_DETAILS_PROVIDERS.includes(provider)
	const cleanedContent = shouldCleanContent
		? filteredContent.map(cleanContentBlock)
		: (filteredContent as Anthropic.MessageParam["content"])

	return { role, content: cleanedContent }
}

/**
 * Clean a content block by removing Skycode-specific fields and returning only Anthropic-compatible fields
 */
export function cleanContentBlock(block: SkycodeContent): Anthropic.ContentBlock {
	// Fast path: if no Skycode-specific fields exist, return as-is
	const hasSkycodeFields =
		"reasoning_details" in block ||
		"call_id" in block ||
		"summary" in block ||
		(block.type !== "thinking" && "signature" in block)

	if (!hasSkycodeFields) {
		return block as Anthropic.ContentBlock
	}

	// Removes Skycode-specific fields & the signature field that's added for Gemini.
	// biome-ignore lint/correctness/noUnusedVariables: intentional destructuring to remove properties
	const { reasoning_details, call_id, summary, ...rest } = block as any

	// Remove signature from non-thinking blocks that were added for Gemini
	if (block.type !== "thinking" && rest.signature) {
		rest.signature = undefined
	}

	return rest satisfies Anthropic.ContentBlock
}
