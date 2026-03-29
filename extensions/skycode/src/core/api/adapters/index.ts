import { SkycodeStorageMessage } from "@/shared/messages/content"
import { SkycodeDefaultTool } from "@/shared/tools"
import { convertApplyPatchToolCalls, convertWriteToFileToolCalls } from "./diff-editors"

/**
 * Transforms tool call messages between different tool formats based on native tool support.
 * Converts between apply_patch and write_to_file/replace_in_file formats as needed.
 *
 * @param skycodeMessages - Array of messages containing tool calls to transform
 * @param nativeTools - Array of tools natively supported by the current provider
 * @returns Transformed messages array, or original if no transformation needed
 */
export function transformToolCallMessages(
	skycodeMessages: SkycodeStorageMessage[],
	nativeTools?: SkycodeDefaultTool[],
): SkycodeStorageMessage[] {
	// Early return if no messages or native tools provided
	if (!skycodeMessages?.length || !nativeTools?.length) {
		return skycodeMessages
	}

	// Create Sets for O(1) lookup performance
	const nativeToolSet = new Set(nativeTools)
	const usedToolSet = new Set<string>()

	// Single pass: collect all tools used in assistant messages
	for (const msg of skycodeMessages) {
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === "tool_use" && block.name) {
					usedToolSet.add(block.name)
				}
			}
		}
	}

	// Early return if no tools were used
	if (usedToolSet.size === 0) {
		return skycodeMessages
	}

	// Determine which conversion to apply
	const hasApplyPatchNative = nativeToolSet.has(SkycodeDefaultTool.APPLY_PATCH)
	const hasFileEditNative = nativeToolSet.has(SkycodeDefaultTool.FILE_EDIT) || nativeToolSet.has(SkycodeDefaultTool.FILE_NEW)

	const hasApplyPatchUsed = usedToolSet.has(SkycodeDefaultTool.APPLY_PATCH)
	const hasFileEditUsed = usedToolSet.has(SkycodeDefaultTool.FILE_EDIT) || usedToolSet.has(SkycodeDefaultTool.FILE_NEW)

	// Convert write_to_file/replace_in_file → apply_patch
	if (hasApplyPatchNative && hasFileEditUsed) {
		return convertWriteToFileToolCalls(skycodeMessages)
	}

	// Convert apply_patch → write_to_file/replace_in_file
	if (hasFileEditNative && hasApplyPatchUsed) {
		return convertApplyPatchToolCalls(skycodeMessages)
	}

	return skycodeMessages
}
