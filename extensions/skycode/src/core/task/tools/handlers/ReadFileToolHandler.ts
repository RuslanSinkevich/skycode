import * as path from "path"
import * as vscode from "vscode"
import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { resolveWorkspacePath } from "@core/workspace"
import { extractFileContent } from "@integrations/misc/extract-file-content"
import { getReadablePath, isLocatedInWorkspace } from "@utils/path"
import { SkycodeSayTool } from "@/shared/ExtensionMessage"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { ToolResponse } from "../../index"
import type { IFullyManagedTool } from "../ToolExecutorCoordinator"
import type { ToolValidator } from "../ToolValidator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"
import { canStubReread, deletedRangeKey, hashContent, parseLineParam, sliceForRead, unchangedStub } from "./readFileSlicing"

export class ReadFileToolHandler implements IFullyManagedTool {
	readonly name = SkycodeDefaultTool.FILE_READ

	constructor(private validator: ToolValidator) {}

	getDescription(block: ToolUse): string {
		return `[${block.name} for '${block.params.path}']`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const relPath = block.params.path

		const config = uiHelpers.getConfig()

		// Create and show partial UI message
		const sharedMessageProps = {
			tool: "readFile",
			path: getReadablePath(config.cwd, uiHelpers.removeClosingTag(block, "path", relPath)),
			content: undefined,
			operationIsLocatedInWorkspace: await isLocatedInWorkspace(relPath),
		}

		const partialMessage = JSON.stringify(sharedMessageProps)

		// [SKYCODE-SKYCODE] Cursor-style: always auto-execute, show as info (no ask)
		await uiHelpers.removeLastPartialMessageIfExistsWithType("ask", "tool")
		await uiHelpers.say("tool", partialMessage, undefined, undefined, block.partial)
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const relPath: string | undefined = block.params.path

		// Validate required parameters
		const pathValidation = this.validator.assertRequiredParams(block, "path")
		if (!pathValidation.ok) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "path")
		}

		// Check skycodeignore access
		const accessValidation = this.validator.checkSkycodeIgnorePath(relPath!)
		if (!accessValidation.ok) {
			await config.callbacks.say("skycodeignore_error", relPath)
			return formatResponse.toolError(formatResponse.skycodeIgnoreError(relPath!))
		}

		config.taskState.consecutiveMistakeCount = 0

		// Resolve the absolute path based on multi-workspace configuration
		const pathResult = resolveWorkspacePath(config, relPath!, "ReadFileToolHandler.execute")
		const { absolutePath, displayPath } =
			typeof pathResult === "string" ? { absolutePath: pathResult, displayPath: relPath! } : pathResult

		// Handle approval flow
		const sharedMessageProps = {
			tool: "readFile",
			path: getReadablePath(config.cwd, displayPath),
			content: absolutePath,
			operationIsLocatedInWorkspace: await isLocatedInWorkspace(relPath!),
		} satisfies SkycodeSayTool

		const completeMessage = JSON.stringify(sharedMessageProps)

		// [SKYCODE-SKYCODE] Cursor-style: always auto-execute (no ask)
		await config.callbacks.removeLastPartialMessageIfExistsWithType("ask", "tool")
		await config.callbacks.say("tool", completeMessage, undefined, undefined, false)

		// Run PreToolUse hook after approval but before execution
		try {
			const { ToolHookUtils } = await import("../utils/ToolHookUtils")
			await ToolHookUtils.runPreToolUseIfEnabled(config, block)
		} catch (error) {
			const { PreToolUseHookCancellationError } = await import("@core/hooks/PreToolUseHookCancellationError")
			if (error instanceof PreToolUseHookCancellationError) {
				return formatResponse.toolDenied()
			}
			throw error
		}

		// Try reading from editor buffer first (includes unsaved changes).
		// textDocuments only contains text files — binary (PDF, DOCX, images) won't be here.
		const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath.toLowerCase() === absolutePath.toLowerCase())
		let text: string
		let hasImage = false
		if (openDoc) {
			text = openDoc.getText()
		} else {
			// Fall back to full disk pipeline (binary formats, encoding detection, etc.)
			const supportsImages = config.api.getModel().info.supportsImages ?? false
			let fileContent: Awaited<ReturnType<typeof extractFileContent>>
			try {
				fileContent = await extractFileContent(absolutePath, supportsImages)
			} catch (error) {
				// [SKYCODE] Мягкие подсказки при ошибках: похожие файлы / это папка
				const hint = await buildReadErrorHint(error, absolutePath)
				if (hint) {
					return formatResponse.toolError(hint)
				}
				throw error
			}
			text = fileContent.text
			// Handle image blocks separately - they need to be pushed to userMessageContent
			if (fileContent.imageBlock) {
				config.taskState.userMessageContent.push(fileContent.imageBlock)
				hasImage = true
			}
		}

		// Track file read operation
		await config.services.fileContextTracker.trackFileContext(relPath!, "read_tool")

		if (hasImage) {
			return sliceForRead(text).output
		}

		const startLine = parseLineParam(block.params.start_line)
		const endLine = parseLineParam(block.params.end_line)
		const hasRange = startLine !== undefined || endLine !== undefined

		// [SKYCODE] Повторное чтение без диапазона неизменённого файла, чей прошлый результат ещё в контексте
		const hash = hashContent(text)
		const cacheKey = absolutePath.toLowerCase()
		const cache = config.taskState.readFileCache
		if (!hasRange) {
			const prev = cache.get(cacheKey)
			if (
				canStubReread(
					prev,
					hash,
					config.taskState.conversationHistoryDeletedRange,
					config.messageState.getApiConversationHistory().length,
				)
			) {
				return unchangedStub(prev!.totalLines)
			}
		}

		const slice = sliceForRead(text, startLine, endLine)
		if (!hasRange) {
			cache.set(cacheKey, {
				hash,
				historyLength: config.messageState.getApiConversationHistory().length,
				deletedRangeKey: deletedRangeKey(config.taskState.conversationHistoryDeletedRange),
				totalLines: slice.totalLines,
			})
		}
		return slice.output
	}
}

/** [SKYCODE] Текст подсказки для ошибки чтения (файл не найден / папка) или undefined */
async function buildReadErrorHint(error: unknown, absolutePath: string): Promise<string | undefined> {
	const message = error instanceof Error ? error.message : String(error)
	if (/EISDIR/.test(message)) {
		return "This is a directory. Use list_files to see its contents."
	}
	if (!/File not found/.test(message)) {
		return undefined
	}
	let result = `File not found: ${absolutePath}`
	try {
		const base = path.basename(absolutePath)
		if (base && !/[{}[\]*?]/.test(base)) {
			const cts = new vscode.CancellationTokenSource()
			const timer = setTimeout(() => cts.cancel(), 3000)
			try {
				const found = await vscode.workspace.findFiles(
					`**/${base}`,
					"{**/node_modules/**,**/bin/**,**/obj/**,**/.git/**}",
					5,
					cts.token,
				)
				if (found.length > 0) {
					result += `\nDid you mean: ${found.map((u) => vscode.workspace.asRelativePath(u, false)).join(", ")}?`
				}
			} finally {
				clearTimeout(timer)
				cts.dispose()
			}
		}
	} catch {
		// подсказки необязательны
	}
	return result
}
