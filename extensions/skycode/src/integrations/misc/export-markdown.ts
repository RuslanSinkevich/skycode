import { Anthropic } from "@anthropic-ai/sdk"

/** Content blocks plus `tool_reference` as nested in `tool_result.content`. */
type MarkdownContentBlock = Anthropic.ContentBlockParam | Anthropic.ToolReferenceBlockParam

/**
 * Formats a content block to markdown for display in API request messages.
 * Used by Task class to format user content for the api_req_started message.
 */
export function formatContentBlockToMarkdown(block: MarkdownContentBlock): string {
	switch (block.type) {
		case "text":
			return block.text
		case "image":
			return `[Image]`
		case "document":
			return `[Document]`
		case "search_result":
			return `[Search result]`
		case "tool_reference":
			return `[Tool reference]`
		case "thinking":
			return `[Thinking]`
		case "redacted_thinking":
			return `[Redacted thinking]`
		case "tool_use":
			let input: string
			if (typeof block.input === "object" && block.input !== null) {
				input = Object.entries(block.input)
					.map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
					.join("\n")
			} else {
				input = String(block.input)
			}
			return `[Tool Use: ${block.name}]\n${input}`
		case "tool_result":
			if (typeof block.content === "string") {
				return `[Tool${block.is_error ? " (Error)" : ""}]\n${block.content}`
			} else if (Array.isArray(block.content)) {
				return `[Tool${block.is_error ? " (Error)" : ""}]\n${block.content
					.map((contentBlock: MarkdownContentBlock) => formatContentBlockToMarkdown(contentBlock))
					.join("\n")}`
			} else {
				return `[Tool${block.is_error ? " (Error)" : ""}]`
			}
		default:
			return "[Unexpected content type]"
	}
}
