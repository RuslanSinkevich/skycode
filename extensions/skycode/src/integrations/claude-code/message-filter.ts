import type { Anthropic } from "@anthropic-ai/sdk"
import { isBase64ImageSource } from "@/shared/messages/message-interchange"

/**
 * Filters out image blocks from messages since Claude Code doesn't support images.
 * Replaces image blocks with text placeholders similar to how VSCode LM provider handles it.
 */
export function filterMessagesForClaudeCode(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
	return messages.map((message) => {
		// Handle simple string messages
		if (typeof message.content === "string") {
			return message
		}

		// Handle complex message structures
		const filteredContent = message.content.map((block) => {
			if (block.type === "image") {
				// Replace image blocks with text placeholders
				const sourceType = block.source?.type || "unknown"
				const detail = isBase64ImageSource(block.source) ? block.source.media_type : block.source.url
				return {
					type: "text" as const,
					text: `[Image (${sourceType}): ${detail} not supported by Claude Code]`,
				}
			}
			return block
		})

		return {
			...message,
			content: filteredContent,
		}
	})
}
