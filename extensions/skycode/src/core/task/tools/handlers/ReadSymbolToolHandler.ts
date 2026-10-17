import * as fs from "fs/promises"
import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { resolveWorkspacePath } from "@core/workspace"
import { extractDefinitionRanges } from "@services/tree-sitter/extractDefinitions"
import { getReadablePath, isLocatedInWorkspace } from "@utils/path"
import { SkycodeSayTool } from "@/shared/ExtensionMessage"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { ToolResponse } from "../../index"
import type { IFullyManagedTool } from "../ToolExecutorCoordinator"
import type { ToolValidator } from "../ToolValidator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"
import { buildReadSymbolOutput, parseSymbolParam, unsupportedLanguageMessage } from "./readSymbolCore"

/**
 * [SKYCODE] read_symbol: прочитать функцию/метод/класс по имени вместо всего файла.
 * В чате показывается как обычное чтение файла (tool: "readFile").
 */
export class ReadSymbolToolHandler implements IFullyManagedTool {
	readonly name = SkycodeDefaultTool.READ_SYMBOL

	constructor(private validator: ToolValidator) {}

	getDescription(block: ToolUse): string {
		return `[${block.name} '${block.params.symbol}' in '${block.params.path}']`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const relPath = block.params.path
		const config = uiHelpers.getConfig()

		const partialMessage = JSON.stringify({
			tool: "readFile",
			path: getReadablePath(config.cwd, uiHelpers.removeClosingTag(block, "path", relPath)),
			content: undefined,
			operationIsLocatedInWorkspace: await isLocatedInWorkspace(relPath),
		})

		await uiHelpers.removeLastPartialMessageIfExistsWithType("ask", "tool")
		await uiHelpers.say("tool", partialMessage, undefined, undefined, block.partial)
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const relPath: string | undefined = block.params.path

		for (const param of ["path", "symbol"] as const) {
			if (!this.validator.assertRequiredParams(block, param).ok) {
				config.taskState.consecutiveMistakeCount++
				return await config.callbacks.sayAndCreateMissingParamError(this.name, param)
			}
		}

		const accessValidation = this.validator.checkSkycodeIgnorePath(relPath!)
		if (!accessValidation.ok) {
			await config.callbacks.say("skycodeignore_error", relPath)
			return formatResponse.toolError(formatResponse.skycodeIgnoreError(relPath!))
		}

		const queries = parseSymbolParam(block.params.symbol)
		if (queries.length === 0) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(this.name, "symbol")
		}

		config.taskState.consecutiveMistakeCount = 0

		const pathResult = resolveWorkspacePath(config, relPath!, "ReadSymbolToolHandler.execute")
		const { absolutePath, displayPath } =
			typeof pathResult === "string" ? { absolutePath: pathResult, displayPath: relPath! } : pathResult

		const completeMessage = JSON.stringify({
			tool: "readFile",
			path: getReadablePath(config.cwd, displayPath),
			content: absolutePath,
			operationIsLocatedInWorkspace: await isLocatedInWorkspace(relPath!),
		} satisfies SkycodeSayTool)

		await config.callbacks.removeLastPartialMessageIfExistsWithType("ask", "tool")
		await config.callbacks.say("tool", completeMessage, undefined, undefined, false)

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

		// Читаем с диска (агент правит файлы через инструменты, которые сохраняют на диск)
		let text: string
		try {
			text = await fs.readFile(absolutePath, "utf8")
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (/ENOENT/.test(message)) {
				return formatResponse.toolError(`File not found: ${absolutePath}`)
			}
			if (/EISDIR/.test(message)) {
				return formatResponse.toolError("This is a directory. Use list_files to see its contents.")
			}
			throw error
		}

		await config.services.fileContextTracker.trackFileContext(relPath!, "read_tool")

		const { supported, defs } = await extractDefinitionRanges(absolutePath, text)
		if (!supported) {
			return unsupportedLanguageMessage(displayPath)
		}
		return buildReadSymbolOutput(text, defs, queries, displayPath)
	}
}
